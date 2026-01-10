# Deployment Guide

## 1. Database (Supabase)
Your database is already hosted on Supabase. You will need the **URL** and **Service Role Key** for the Backend, and **URL** and **Anon Key** for the Frontend.

## 2. Backend (Render)
We have added a `render.yaml` configuration file to the repository.

1. Connect this repository to [Render](https://render.com).
2. Click **New +** -> **Blueprint**.
3. Select this repository (`sat-mock-back`).
4. Render will detect `render.yaml`.
5. **Environment Variables**:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
6. Deploy.

## 3. Frontend (Vercel)
1. Connect the frontend repository (`sat-mock-front`) to [Vercel](https://vercel.com).
2. Framework Preset: **Next.js**.
3. **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_URL` (Your Render Backend URL)
4. Deploy.
