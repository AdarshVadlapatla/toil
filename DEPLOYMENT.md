# Deployment Guide for Vercel

This guide will help you deploy the TOIL application to Vercel securely.

## Prerequisites

- Vercel account
- Supabase project with API keys
- Git repository (GitHub, GitLab, or Bitbucket)

## Backend Deployment

### Option 1: Deploy Backend to Vercel (Serverless Functions)

1. **Create `vercel.json` in the root directory:**

```json
{
  "version": 2,
  "builds": [
    {
      "src": "back_end/server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "back_end/server.js"
    }
  ],
  "env": {
    "SUPABASE_URL": "@supabase_url",
    "SUPABASE_KEY": "@supabase_key",
    "CORS_ORIGIN": "@cors_origin"
  }
}
```

2. **Set Environment Variables in Vercel:**
   - Go to your Vercel project settings
   - Navigate to "Environment Variables"
   - Add the following:
     - `SUPABASE_URL`: Your Supabase project URL
     - `SUPABASE_KEY`: Your Supabase anon key
     - `CORS_ORIGIN`: Your frontend domain (e.g., `https://your-app.vercel.app`)

### Option 2: Deploy Backend Separately (Recommended)

Deploy the backend to a separate service (Railway, Render, Heroku, etc.) and use that URL for the frontend.

**For Railway/Render:**
1. Connect your repository
2. Set root directory to `back_end`
3. Add environment variables from `.env.example`
4. Deploy

## Frontend Deployment

1. **Connect Repository to Vercel:**
   - Import your Git repository in Vercel
   - Set root directory to `front_end/my-app`

2. **Set Environment Variables:**
   - `NEXT_PUBLIC_API_URL`: Your backend API URL
     - For local: `http://localhost:3001`
     - For production: `https://your-backend.vercel.app` or your backend URL

3. **Deploy:**
   - Vercel will automatically detect Next.js
   - Build command: `npm run build` (default)
   - Output directory: `.next` (default)

## Environment Variables Summary

### Backend (.env)
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_anon_key_here
PORT=3001
CORS_ORIGIN=https://your-frontend.vercel.app
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=https://your-backend.vercel.app
```

## Security Checklist

- ✅ API keys moved to environment variables
- ✅ .env files added to .gitignore
- ✅ CORS configured for production domains
- ✅ No hardcoded secrets in code
- ✅ Environment variable validation in backend

## Post-Deployment

1. **Update CORS_ORIGIN** in backend to match your frontend domain
2. **Test API endpoints** to ensure they're accessible
3. **Verify environment variables** are set correctly
4. **Check browser console** for any CORS errors

## Troubleshooting

### CORS Errors
- Ensure `CORS_ORIGIN` in backend matches your frontend domain exactly
- Include protocol (https://) in CORS_ORIGIN
- For multiple domains, use comma-separated list

### API Connection Issues
- Verify `NEXT_PUBLIC_API_URL` is set correctly
- Check backend is deployed and accessible
- Ensure backend environment variables are set

### Environment Variables Not Loading
- Restart Vercel deployment after adding variables
- Ensure variable names match exactly (case-sensitive)
- For Next.js, use `NEXT_PUBLIC_` prefix for client-side variables

