# Local Development with Netlify and Supabase

To run the application with full backend support (Supabase Local Emulator), follow these simple steps.

## 1. Start Local Supabase (Optional)
If not already running, start the Supabase emulator:
```bash
supabase start
```
- **Virtual DB API**: `http://127.0.0.1:54321`
- **Virtual DB Studio**: `http://127.0.0.1:54323` (Management UI)

## 2. Run Application
Execute the following in the project root:
```bash
// turbo
npx netlify dev
```
- **Local URL**: `http://localhost:8888` (Default)
- **Note**: `.env.local` is automatically used to connect to the Virtual DB.

## 3. Deployment
When local testing is complete, push DB changes to production:
```bash
supabase db push
```
