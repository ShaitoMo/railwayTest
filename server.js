const express = require("express");
const mysql = require("mysql2/promise");

const app = express();
app.use(express.json());

// ─── Database connection ───────────────────────────────────────────
// Railway injects these automatically from the MySQL service variables.
// Map them in Railway's UI: Settings → Variables → Reference Variables.

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306"),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "railway",
  waitForConnections: true,
  connectionLimit: 10,
};

let pool;

async function initDatabase() {
  pool = mysql.createPool(dbConfig);

  // Create a sample table if it doesn't exist
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  console.log("Database connected and schema ready");
}

// ─── Health check ──────────────────────────────────────────────────

app.get("/health", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (err) {
    res.status(500).json({ status: "error", database: err.message });
  }
});

// ─── CRUD routes: /api/items ───────────────────────────────────────

// List all items
app.get("/api/items", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM items ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get one item
app.get("/api/items/:id", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM items WHERE id = ?", [
      req.params.id,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create item
app.post("/api/items", async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  try {
    const [result] = await pool.execute(
      "INSERT INTO items (name, description) VALUES (?, ?)",
      [name, description || null]
    );
    const [rows] = await pool.execute("SELECT * FROM items WHERE id = ?", [
      result.insertId,
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update item
app.put("/api/items/:id", async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  try {
    const [result] = await pool.execute(
      "UPDATE items SET name = ?, description = ? WHERE id = ?",
      [name, description || null, req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Not found" });

    const [rows] = await pool.execute("SELECT * FROM items WHERE id = ?", [
      req.params.id,
    ]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete item
app.delete("/api/items/:id", async (req, res) => {
  try {
    const [result] = await pool.execute("DELETE FROM items WHERE id = ?", [
      req.params.id,
    ]);
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Not found" });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Test UI ───────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.send(/* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Secure App POC</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; color: #1a1a1a; padding: 2rem; max-width: 640px; margin: 0 auto; }
    h1 { font-size: 1.25rem; margin-bottom: 0.25rem; }
    .subtitle { color: #666; font-size: 0.85rem; margin-bottom: 1.5rem; }
    .status { padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.8rem; margin-bottom: 1.5rem; }
    .status.ok { background: #e8f5e9; color: #2e7d32; }
    .status.err { background: #fce4ec; color: #c62828; }
    .form-row { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
    input { flex: 1; padding: 0.5rem 0.75rem; border: 1px solid #ddd; border-radius: 6px; font-size: 0.9rem; }
    button { padding: 0.5rem 1rem; border: none; border-radius: 6px; font-size: 0.9rem; cursor: pointer; background: #1a1a1a; color: #fff; }
    button:hover { background: #333; }
    button.danger { background: #c62828; }
    button.danger:hover { background: #e53935; }
    .item { display: flex; align-items: center; justify-content: space-between; background: #fff; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 0.5rem; border: 1px solid #eee; }
    .item-info { flex: 1; }
    .item-name { font-weight: 600; }
    .item-desc { color: #666; font-size: 0.85rem; }
    .empty { text-align: center; color: #999; padding: 2rem; }
  </style>
</head>
<body>
  <h1>Secure App POC</h1>
  <p class="subtitle">Railway + Tailscale private networking prototype</p>
  <div id="status">Checking connection...</div>

  <div class="form-row">
    <input type="text" id="name" placeholder="Item name">
    <input type="text" id="desc" placeholder="Description (optional)">
    <button onclick="addItem()">Add</button>
  </div>

  <div id="items"></div>

  <script>
    async function checkHealth() {
      const el = document.getElementById('status');
      try {
        const r = await fetch('/health');
        const d = await r.json();
        el.className = 'status ' + (d.status === 'ok' ? 'ok' : 'err');
        el.textContent = d.status === 'ok'
          ? 'Connected — database is reachable'
          : 'Error — ' + d.database;
      } catch (e) {
        el.className = 'status err';
        el.textContent = 'Cannot reach server';
      }
    }

    async function loadItems() {
      const el = document.getElementById('items');
      try {
        const r = await fetch('/api/items');
        const items = await r.json();
        if (items.length === 0) {
          el.innerHTML = '<div class="empty">No items yet — add one above</div>';
          return;
        }
        el.innerHTML = items.map(i => 
          '<div class="item"><div class="item-info">' +
          '<div class="item-name">' + esc(i.name) + '</div>' +
          (i.description ? '<div class="item-desc">' + esc(i.description) + '</div>' : '') +
          '</div><button class="danger" onclick="deleteItem(' + i.id + ')">Delete</button></div>'
        ).join('');
      } catch (e) {
        el.innerHTML = '<div class="empty">Failed to load items</div>';
      }
    }

    async function addItem() {
      const name = document.getElementById('name').value.trim();
      if (!name) return;
      const desc = document.getElementById('desc').value.trim();
      await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: desc || null })
      });
      document.getElementById('name').value = '';
      document.getElementById('desc').value = '';
      loadItems();
    }

    async function deleteItem(id) {
      await fetch('/api/items/' + id, { method: 'DELETE' });
      loadItems();
    }

    function esc(s) {
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    checkHealth();
    loadItems();
  </script>
</body>
</html>`);
});

// ─── Start ─────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

initDatabase()
  .then(() => {
    app.listen(PORT, "::", () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err.message);
    process.exit(1);
  });
