#!/bin/bash

# Bharat Biz-Agent - Smart Server Startup Script
# Automatically cleans up ports and handles graceful shutdown

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Bharat Biz-Agent Server Manager${NC}"
echo "=================================="

# Function to kill processes on specific ports
kill_port() {
    local port=$1
    local service_name=$2
    
    echo -e "${YELLOW}🔍 Checking port $port...${NC}"
    
    # Find and kill processes on the port
    local pids=$(lsof -ti:$port 2>/dev/null)
    
    if [ ! -z "$pids" ]; then
        echo -e "${RED}🔪 Killing processes on port $port ($service_name):${NC}"
        echo "$pids" | xargs kill -9 2>/dev/null
        sleep 1
        
        # Verify port is free
        if lsof -ti:$port >/dev/null 2>&1; then
            echo -e "${RED}❌ Failed to free port $port${NC}"
            return 1
        else
            echo -e "${GREEN}✅ Port $port freed successfully${NC}"
            return 0
        fi
    else
        echo -e "${GREEN}✅ Port $port is already free${NC}"
        return 0
    fi
}

# Function to cleanup all related processes
cleanup_processes() {
    echo -e "${YELLOW}🧹 Cleaning up existing processes...${NC}"
    
    # Kill any existing node processes for this project
    pkill -f "node index.js" 2>/dev/null
    pkill -f "npm start" 2>/dev/null
    pkill -f "vite" 2>/dev/null
    pkill -f "npm run dev" 2>/dev/null
    
    # Kill all Telegram bot processes specifically
    echo -e "${YELLOW}📱 Killing Telegram bot instances...${NC}"
    pkill -f "telegram" 2>/dev/null
    pkill -f "node.*telegram" 2>/dev/null
    pkill -f "bot.*8336544391" 2>/dev/null
    
    # Kill processes on our ports
    kill_port 3003 "Backend Server"
    kill_port 5173 "Frontend Dev Server"
    kill_port 27017 "MongoDB (if running locally)"
    
    # Additional force cleanup for stubborn processes
    echo -e "${YELLOW}🔨 Force cleaning any remaining processes...${NC}"
    sleep 2
    
    # Check and kill any remaining processes on ports
    for port in 3003 5173; do
        local pids=$(lsof -ti:$port 2>/dev/null)
        if [ ! -z "$pids" ]; then
            echo -e "${RED}⚠️  Force killing port $port processes: $pids${NC}"
            echo "$pids" | xargs kill -9 2>/dev/null
        fi
    done
    
    # Wait a moment for processes to fully terminate
    sleep 3
    
    echo -e "${GREEN}✅ Cleanup completed${NC}"
}

# Function to start all services serially
start_all() {
    echo -e "${BLUE}🚀 Starting Bharat Biz-Agent (Serial Mode)${NC}"
    echo "=================================="
    
    # Step 1: Clean up everything first
    echo -e "${YELLOW}🧹 Step 1: Cleaning up existing processes...${NC}"
    cleanup_processes
    
    # Step 2: Start MongoDB
    echo -e "${YELLOW}🍃 Step 2: Starting MongoDB...${NC}"
    if pgrep -x mongod >/dev/null; then
        echo -e "${GREEN}✅ MongoDB is already running${NC}"
    elif command -v mongod >/dev/null 2>&1; then
        mongod --dbpath /data/db --fork --logpath /var/log/mongodb.log --bind_ip 127.0.0.1 >/dev/null 2>&1 &
        sleep 3
        if pgrep -x mongod >/dev/null; then
            echo -e "${GREEN}✅ MongoDB started successfully${NC}"
        else
            echo -e "${YELLOW}⚠️  MongoDB not available, continuing...${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  MongoDB not installed, assuming external DB${NC}"
    fi
    
    # Step 3: Start Backend Server
    echo -e "${YELLOW}� Step 3: Starting Backend Server...${NC}"
    cd server
    
    # Check if .env exists
    if [ ! -f ".env" ]; then
        echo -e "${RED}❌ .env file not found in server directory${NC}"
        exit 1
    fi
    
    # Kill any existing processes on port 3003
    if lsof -ti:3003 >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Port 3003 in use, cleaning up...${NC}"
        lsof -ti:3003 | xargs kill -9 2>/dev/null
        sleep 2
    fi
    
    # Start backend with node index.js (not npm start to avoid conflicts)
    echo -e "${BLUE}📱 Starting backend with Telegram bot...${NC}"
    nohup node index.js > ../server.log 2>&1 &
    local backend_pid=$!
    echo -e "${GREEN}✅ Backend starting (PID: $backend_pid)${NC}"
    
    # Wait for backend to fully start
    echo -e "${YELLOW}⏳ Waiting for backend to initialize...${NC}"
    sleep 8
    
    # Check if backend is running
    if curl -s http://localhost:3003/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Backend is running on http://localhost:3003${NC}"
    else
        echo -e "${YELLOW}⚠️  Backend starting but health check failed${NC}"
        echo -e "${YELLOW}This is normal during startup. Check server.log for status.${NC}"
    fi
    
    # Step 4: Start Frontend
    echo -e "${YELLOW}🎨 Step 4: Starting Frontend...${NC}"
    cd ..
    
    # Check if .env.local exists
    if [ ! -f ".env.local" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env.local
            echo -e "${YELLOW}📝 Created .env.local from .env.example${NC}"
        fi
    fi
    
    # Start frontend in background with proper error handling
    nohup npm run dev > frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo "✅ Frontend starting (PID: $FRONTEND_PID)"
    
    # Wait for frontend to start
    echo -e "${YELLOW}⏳ Waiting for frontend to initialize...${NC}"
    sleep 8
    
    # Check if frontend is running
    if ps -p $FRONTEND_PID > /dev/null 2>&1; then
        # Check if it's responding
        if curl -s http://localhost:5173 > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Frontend is running on http://localhost:5173${NC}"
        else
            echo -e "${YELLOW}⚠️  Frontend process started but not yet responding${NC}"
            echo -e "${YELLOW}⏳ Giving it more time...${NC}"
            sleep 5
            
            if curl -s http://localhost:5173 > /dev/null 2>&1; then
                echo -e "${GREEN}✅ Frontend is now responding on http://localhost:5173${NC}"
            else
                echo -e "${RED}❌ Frontend failed to respond properly${NC}"
                echo -e "${YELLOW}📋 Check frontend.log for details${NC}"
            fi
        fi
    else
        echo -e "${RED}❌ Frontend failed to start${NC}"
        echo -e "${YELLOW}📋 Check frontend.log for details${NC}"
    fi
    echo "=================================="
    show_status
    echo ""
    echo -e "${BLUE}📋 Logs:${NC}"
    echo -e "${BLUE}   Backend: server.log${NC}"
    echo -e "${BLUE}   Frontend: frontend.log${NC}"
    echo ""
    echo -e "${BLUE}🌐 Access URLs:${NC}"
    echo -e "${BLUE}   Frontend: http://localhost:5173${NC}"
    echo -e "${BLUE}   Backend:  http://localhost:3003${NC}"
    echo -e "${BLUE}   Health:   http://localhost:3003/health${NC}"
}

# Function to show status
show_status() {
    echo -e "${BLUE}📊 Service Status${NC}"
    echo "=================="
    
    # Check backend
    if curl -s http://localhost:3003/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Backend: RUNNING (http://localhost:3003)${NC}"
    else
        echo -e "${RED}❌ Backend: STOPPED${NC}"
    fi
    
    # Check frontend
    if curl -s http://localhost:5173 >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Frontend: RUNNING (http://localhost:5173)${NC}"
    else
        echo -e "${RED}❌ Frontend: STOPPED${NC}"
    fi
    
    # Show processes on our ports
    echo ""
    echo -e "${BLUE}🔍 Port Usage:${NC}"
    for port in 3003 5173 27017; do
        local pids=$(lsof -ti:$port 2>/dev/null)
        if [ ! -z "$pids" ]; then
            echo -e "${YELLOW}⚠️  Port $port: $pids${NC}"
        else
            echo -e "${GREEN}✅ Port $port: Free${NC}"
        fi
    done
}

# Function to show logs
show_logs() {
    echo -e "${BLUE}📋 Recent Logs${NC}"
    echo "=================="
    
    echo -e "${YELLOW}🔧 Backend Logs (last 30 lines):${NC}"
    if [ -f "server.log" ]; then
        tail -30 server.log
    else
        echo "No server.log found"
    fi
    
    echo ""
    echo -e "${YELLOW}🎨 Frontend Logs (last 30 lines):${NC}"
    if [ -f "frontend.log" ]; then
        tail -30 frontend.log
    else
        echo "No frontend.log found"
    fi
}

# Function to stop all services with proper cleanup
stop_all() {
    echo -e "${YELLOW}🛑 Stopping all services gracefully...${NC}"
    
    # Stop frontend
    echo -e "${BLUE}🎨 Stopping frontend...${NC}"
    pkill -f "npm run dev" 2>/dev/null
    pkill -f "vite" 2>/dev/null
    lsof -ti:5173 | xargs kill -9 2>/dev/null
    
    # Stop backend
    echo -e "${BLUE}🔧 Stopping backend...${NC}"
    pkill -f "node index.js" 2>/dev/null
    pkill -f "npm start" 2>/dev/null
    lsof -ti:3003 | xargs kill -9 2>/dev/null
    
    # Kill ports
    kill_port 3003 "Backend"
    kill_port 5173 "Frontend"
    
    # Wait for processes to fully terminate
    sleep 3
    
    # Verify cleanup
    echo -e "${BLUE}🔍 Verifying cleanup...${NC}"
    if lsof -ti:3003 >/dev/null 2>&1; then
        echo -e "${RED}⚠️  Port 3003 still in use, force killing...${NC}"
        lsof -ti:3003 | xargs kill -9 2>/dev/null
    fi
    
    if lsof -ti:5173 >/dev/null 2>&1; then
        echo -e "${RED}⚠️  Port 5173 still in use, force killing...${NC}"
        lsof -ti:5173 | xargs kill -9 2>/dev/null
    fi
    
    echo -e "${GREEN}✅ All services stopped${NC}"
}

# Main script logic
case "${1:-start}" in
    "start"|"run"|"all")
        start_all
        ;;
    "stop"|"kill")
        stop_all
        ;;
    "restart")
        stop_all
        sleep 2
        start_all
        ;;
    "status"|"check")
        show_status
        ;;
    "logs"|"log")
        show_logs
        ;;
    "cleanup"|"clean")
        cleanup_processes
        ;;
    "help"|"-h"|"--help")
        echo "Bharat Biz-Agent Server Manager"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  start     Start all services serially (default)"
        echo "  stop      Stop all services"
        echo "  restart   Restart all services"
        echo "  status    Show service status"
        echo "  logs      Show recent logs"
        echo "  cleanup   Kill processes and free ports"
        echo "  help      Show this help"
        echo ""
        echo "Features:"
        echo "  ✅ Automatic port cleanup"
        echo "  ✅ Serial startup (MongoDB → Backend → Frontend)"
        echo "  ✅ Telegram bot included"
        echo "  ✅ Health checks"
        echo "  ✅ Error handling"
        echo ""
        echo "Examples:"
        echo "  $0              # Start all services"
        echo "  $0 stop         # Stop all services"
        echo "  $0 restart      # Restart all services"
        echo "  $0 status       # Check if services are running"
        echo ""
        echo "Single Command Solution:"
        echo "  Just run '$0' and everything starts automatically!"
        ;;
    *)
        echo -e "${RED}❌ Unknown command: $1${NC}"
        echo -e "${YELLOW}Use '$0 help' for available commands${NC}"
        exit 1
        ;;
esac
