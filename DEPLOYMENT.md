# Deployment Guide

## Railway.app Deployment (Recommended)

Railway.app offers the simplest deployment experience with usage-based pricing and excellent Discord bot support.

### Prerequisites
- GitHub account
- Railway.app account (free trial available)
- Discord Application configured

### Step 1: Prepare Repository

1. **Ensure clean repository**:
   ```bash
   git add .
   git commit -m \"Prepare for deployment\"
   git push origin main
   ```

2. **Verify .gitignore excludes**:
   - Database files (*.db)
   - Environment files (.env)
   - Temporary/development files

### Step 2: Deploy to Railway

1. **Create new Railway project**:
   - Go to [railway.app](https://railway.app)
   - Click \"New Project\" → \"Deploy from GitHub repo\"
   - Select your repository

2. **Configure Environment Variables**:
   - Click \"Add Variables\" during setup
   - Add required production variables (see below)

3. **Deploy**:
   - Railway will automatically detect and deploy your Node.js app
   - Both web app and Discord bot will run together

### Step 3: Environment Variables

Set these variables in Railway dashboard:

```env
NODE_ENV=production
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_BOT_TOKEN=your_discord_bot_token
SESSION_SECRET=generate_secure_random_string
SECURE_COOKIES=true
TRUST_PROXY=true
```

**Railway will automatically set**:
- `PORT` (Railway assigns this)
- `WEB_APP_URL` (use Railway's generated domain)
- `DISCORD_REDIRECT_URI` (use Railway's domain + /auth/discord/callback)
- `API_BASE_URL` (use Railway's domain + /api)

### Step 4: Update Discord Application

1. **Update OAuth2 Redirect URI**:
   - Go to Discord Developer Portal
   - Update redirect URI to: `https://your-railway-domain.railway.app/auth/discord/callback`

2. **Test bot permissions**:
   - Ensure bot has required permissions in your Discord server
   - Test slash commands work properly

### Step 5: Domain Configuration (Optional)

1. **Generate custom domain** (Railway Pro plan):
   - Go to project settings → Custom Domain
   - Add your domain and configure DNS

2. **Update environment variables** with new domain if using custom domain

## Cost Estimation

### Railway Pricing:
- **Trial**: $5 one-time credit (good for testing)
- **Hobby**: $5/month + usage (recommended for small communities)
- **Pro**: $20/month + usage (for larger deployments)

### Expected Usage:
- **Small community (< 50 users)**: ~$5-8/month total
- **Medium community (50-200 users)**: ~$8-15/month total
- Usage-based billing means lower costs when idle

## Alternative Platforms

### Render.com
- Similar to Railway but may require PostgreSQL for database persistence
- Free tier available with limitations

### Fly.io
- Good performance, requires more configuration
- Free tier with resource limits

### Self-Hosting
- VPS providers (DigitalOcean, Linode, etc.)
- Requires more setup but full control

## Database Considerations

### SQLite (Current)
- ✅ Simple deployment
- ✅ No external dependencies
- ⚠️ Single file, not ideal for high concurrency
- ⚠️ May lose data on some platforms between deploys

### PostgreSQL Migration (Recommended for Production)
- ✅ Better for production environments
- ✅ Railway includes managed PostgreSQL
- ✅ Better concurrent access handling
- ❌ Requires migration from SQLite

## Monitoring and Logs

### Railway Features:
- Built-in application logs
- Resource usage monitoring
- Deployment history
- Environment-specific deployments

### Health Checks:
- Web app: `GET /api/boxes` should return box data
- Discord bot: Check bot online status in Discord
- Integration: Test account linking functionality

## Troubleshooting

### Common Issues:

1. **Bot offline after deployment**:
   - Check environment variables are set correctly
   - Verify bot token is valid
   - Check Railway logs for errors

2. **Discord commands not working**:
   - Ensure bot has proper permissions in server
   - Check API connectivity between bot and web app
   - Verify redirect URI matches exactly

3. **Database issues**:
   - SQLite file may reset on some deployments
   - Consider migrating to PostgreSQL for persistence

4. **Session issues**:
   - Ensure `SESSION_SECRET` is set and secure
   - Check `SECURE_COOKIES` and `TRUST_PROXY` settings

### Getting Help:
- Railway Discord community
- Check Railway documentation
- Review application logs in Railway dashboard

## Post-Deployment Checklist

- [ ] Web application loads correctly
- [ ] Discord bot appears online
- [ ] Account linking works
- [ ] All Discord commands respond
- [ ] Admin panel accessible
- [ ] Database persistence confirmed
- [ ] SSL certificate working
- [ ] Monitor resource usage for first week

## Security Best Practices

- [ ] Rotate Discord bot token regularly
- [ ] Use strong session secrets
- [ ] Enable HTTPS only in production
- [ ] Regularly update dependencies
- [ ] Monitor for security vulnerabilities
- [ ] Backup database regularly (if using SQLite)
