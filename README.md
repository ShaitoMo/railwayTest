# Secure App POC — Railway + Tailscale

A prototype CRUD application deployed privately on Railway, accessible only through Tailscale's encrypted network.

**What this proves:** Your MySQL database and Node.js app have zero public exposure. Users reach the app only through an authenticated, encrypted Tailscale tunnel.

---

## Prerequisites

- A GitHub account (Railway deploys from GitHub)
- A Tailscale account (free tier supports up to 3 users)
- An identity provider connected to Tailscale (Google Workspace, Okta, etc.)

---

## Setup

### 1. Push this repo to GitHub

Create a new repo and push:

```
git init
git add .
git commit -m "initial commit"
git remote add origin git@github.com:YOUR_ORG/secure-app-poc.git
git push -u origin main
```

### 2. Tailscale — create your network

1. Sign up at [login.tailscale.com](https://login.tailscale.com) using your identity provider.
2. Go to **Settings → Keys → Generate auth key**.
   - Description: `railway-subnet-router`
   - Reusable: **Yes** · Ephemeral: **No** · Pre-approved: **Yes**
   - Copy the key — you'll need it in step 4.
3. Go to **DNS → Nameservers → Add nameserver → Custom**.
   - Nameserver address: `fd12::10`
   - Restrict to domain: `railway.internal`

### 3. Railway — create the project

1. Go to [railway.com](https://railway.com) → **New Project** → name it `secure-app-poc`.

### 4. Railway — deploy MySQL

1. Inside the project: **Create → Database → MySQL**.
2. Go to the MySQL service → **Settings → Networking** → disable the public domain.
3. Note: the private domain is `mysql.railway.internal`.

### 5. Railway — deploy the Node.js app

1. **Create → GitHub Repo** → select `secure-app-poc`.
2. Go to the app service → **Variables** → add:

   | Variable      | Value                                          |
   |---------------|-------------------------------------------------|
   | `DB_HOST`     | `mysql.railway.internal`                        |
   | `DB_PORT`     | `3306`                                          |
   | `DB_USER`     | Reference from MySQL → `MYSQLUSER`              |
   | `DB_PASSWORD` | Reference from MySQL → `MYSQLPASSWORD`          |
   | `DB_NAME`     | `railway`                                       |

3. **Settings → Networking** → disable the public domain.

### 6. Railway — deploy the Tailscale subnet router

1. **Create → Template** → search for **"Tailscale Subnet Router"**.
2. Set `TAILSCALE_AUTHKEY` = the auth key from step 2.
3. Deploy. The router will join your tailnet and advertise `fd12::/16`.

### 7. Tailscale — approve the route

1. Go to [login.tailscale.com](https://login.tailscale.com) → **Machines**.
2. Find the new machine → **Edit route settings**.
3. Enable the `fd12::/16` route → **Save**.

### 8. Tailscale — configure access control

Go to **Access Controls** and set:

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["group:app-users"],
      "dst": ["autogroup:self:*"]
    },
    {
      "action": "accept",
      "src": ["group:app-users"],
      "dst": ["fd12::/16:3000"]
    }
  ],
  "groups": {
    "group:app-users": [
      "user1@yourdomain.com",
      "user2@yourdomain.com"
    ]
  }
}
```

### 9. Test from a user device

1. Install the Tailscale client on your device.
2. Sign in with your identity provider credentials.
3. On Linux, run: `tailscale set --accept-routes`
4. Open a browser and go to: `http://app.railway.internal:3000`
5. You should see the test UI with a health check showing "Connected."

### 10. Verify security

- From a device **not** on the tailnet → app should be unreachable.
- Remove a user from `group:app-users` → they should lose access immediately.
- Resolve `app.railway.internal` from outside the tailnet → should fail.

---

## Project structure

```
secure-app-poc/
├── server.js          # Express app — CRUD API + test UI
├── package.json       # Dependencies
├── .env.example       # Environment variable reference
└── .gitignore
```

---

## API endpoints

| Method   | Path             | Description       |
|----------|------------------|-------------------|
| `GET`    | `/`              | Test UI           |
| `GET`    | `/health`        | Health check      |
| `GET`    | `/api/items`     | List all items    |
| `GET`    | `/api/items/:id` | Get one item      |
| `POST`   | `/api/items`     | Create an item    |
| `PUT`    | `/api/items/:id` | Update an item    |
| `DELETE` | `/api/items/:id` | Delete an item    |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Subnet router not in Tailscale admin | Check `TAILSCALE_AUTHKEY` in Railway. Regenerate if expired. |
| Can't resolve `*.railway.internal` | Verify split DNS config. On Linux: `tailscale set --accept-routes`. |
| "Connection refused" after resolving | Check the app is running and ACL allows port 3000. |
| Intermittent drops during deploys | Normal — the subnet router auto-reconnects. |
