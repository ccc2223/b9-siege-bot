# BB99 Siege War

A comprehensive web application with Discord bot integration for managing responsibillities in the game Raid Shadow Legends

## Features

### 🌐 **Web Application**
- **User Authentication**: Secure login system with multiple user levels (user/admin/owner)
- **Post Management**: Interactive management of 18 siege war posts/positions
- **Application System**: Apply for positions with customizable conditions
- **Admin Panel**: Comprehensive management interface for reviewing applications
- **Asset Management**: Track repair and upgrade status of game assets

### 🤖 **Discord Bot Integration**
- **Account Linking**: Connect Discord accounts to web app profiles
- **Interactive Commands**: Full-featured slash commands with button interfaces
- **Real-time Sync**: Seamless integration between Discord and web app
- **Mobile Access**: Manage positions directly from Discord

## Discord Bot Commands

- `/link` - Check account linking status
- `/profile` - View user profile and statistics
- `/boxes all` - View all boxes with current status and holders
- `/boxes view` - View your assigned boxes
- `/boxes available` - Browse available boxes
- `/boxes apply [box_id]` - Apply for a box with interactive condition selection
- `/boxes hold [box_id]` - Hold an available box
- `/boxes status` - View overall statistics

## Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite with automatic schema management
- **Discord**: Discord.js v14 with slash commands and interactions
- **Frontend**: Vanilla HTML/CSS/JavaScript with real-time updates
- **Authentication**: Session-based with Discord OAuth2 integration

## Security Features

- Secure session management
- Password hashing with bcrypt
- Discord OAuth2 integration
- Environment-based configuration
- Input validation and sanitization

## Quick Start

### Prerequisites
- Node.js 14+ 
- Discord Application (Bot Token, Client ID, Client Secret)

### Installation


1. **Clone and install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your Discord credentials
   ```

3. **Start the application**:
   ```bash
   # Start web app and Discord bot together
   npm run start-all
   
   # Or start separately
   npm start          # Web app only
   npm run bot        # Discord bot only
   ```

4. **Setup Discord Bot**:
   - Create application at https://discord.com/developers/applications
   - Add bot to your server with appropriate permissions
   - Users can link accounts via the web application
### Demo 

Not in the mood to deploy the project yourself? Hit me up for access to a demo or custom deployment for your clan. 

https://forms.gle/BPCVucNsfffjhMAG9

## Screenshots


| Boxes status command                 |
| ------------------------------------ |
| ![failed to load image](https://imgur.com/a/r7537OA) |
| my boxes command                     |
| ![[Pasted image 20250619103521.png]] |
| All boxes command                    |
| ![[Pasted image 20250619102803.png]] |
| Admin panel post applications view   |
| ![[Pasted image 20250619103035.png]] |
| Admin panel import conditions view   |
| ![[Pasted image 20250619103210.png]] |
| Web app post overview                |
| ![[Pasted image 20250619103627.png]] |



## License

MIT License - See LICENSE file for details.
