#!/bin/bash

# Bharat Biz-Agent - Development Startup Script
# This script starts MongoDB (via Docker), backend server, and frontend

echo "🚀 Starting Bharat Biz-Agent Development Environment..."

# Check if MongoDB container is running
if ! docker ps | grep -q mongodb; then
    echo "📦 Starting MongoDB..."
    docker run -d --name mongodb -p 27017:27017 mongo:latest
    sleep 3
else
    echo "✅ MongoDB already running"
fi

# Start backend server
echo "🔧 Starting backend server..."
cd server
node index.js &
BACKEND_PID=$!
echo "Backend started with PID: $BACKEND_PID"

# Wait a moment for backend to start
sleep 3

# Start frontend
echo "🌐 Starting frontend..."
cd ..
npm run dev &
FRONTEND_PID=$!
echo "Frontend started with PID: $FRONTEND_PID"

echo ""
echo "✅ All services started!"
echo ""
echo "🌐 Frontend: http://localhost:5173"
echo "🔧 Backend:  http://localhost:3001"
echo "💚 Health:   http://localhost:3001/health"
echo ""
echo "Press Ctrl+C to stop all services"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "✅ All services stopped"
    exit 0
}

# Set trap for cleanup
trap cleanup INT TERM

# Wait for user to stop
wait
