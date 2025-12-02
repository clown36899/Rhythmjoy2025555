---
description: How to run the local development environment with Netlify Functions
---

# Local Development with Netlify Functions

To properly run the application with backend function support (Supabase, Stripe, etc.), you must use `netlify dev` instead of `npm run dev`.

## Prerequisites
- Node.js installed
- Netlify CLI installed (optional, can use `npx`)
- Valid `.env` file (if applicable)

## Steps

1. **Stop any running servers**
   Ensure no other instances of Vite or Netlify Dev are running.

2. **Run Netlify Dev**
   Execute the following command in the project root:
   ```bash
   // turbo
   npx netlify dev
   ```

   This command will:
   - Start the Vite development server
   - Start the Netlify Functions server
   - Proxy requests to the appropriate handler
   - Inject environment variables from Netlify (if linked)

3. **Access the Application**
   The CLI will output the local URL, usually `http://localhost:8888`.
