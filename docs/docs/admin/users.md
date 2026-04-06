---
sidebar_position: 2
---

# Users

User management allows administrators to create accounts and control access to the platform.

## Accessing User Management

1. Click the **gear icon** in the top bar
2. Navigate to **Users**

<!-- ![User list](../../static/img/screenshots/admin-users.png) -->

## Creating a User

1. Click **New user**
2. Fill in:
   - **Username** (required, unique)
   - **First name** and **Last name** (optional)
   - **Password**
   - **Roles** — User or Admin

## Roles

| Role        | Description                                     |
|-------------|-------------------------------------------------|
| **User**    | Can access assigned contexts and all features within them |
| **Admin**   | Full access: user management, context management, server monitoring |

## Context Assignment

Users must be assigned to contexts to access them:

1. Open a context's settings (from the Admin panel > Contexts)
2. Go to the **Members** section
3. Add or remove users

A user who is not assigned to any context will see an empty dashboard.

:::info
Admin users automatically have access to all contexts regardless of assignment.
:::
