#!/bin/bash

# Bharat Biz-Agent - Quick Start Script
echo "🚀 Starting Bharat Biz-Agent..."

# Check if MongoDB is running
if ! pgrep -x "mongod" > /dev/null; then
    echo "⚠️  MongoDB is not running. Using in-memory database."
fi

# Kill any existing processes
echo "🧹 Cleaning up existing processes..."
pkill -f "node server/index.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

# Wait for processes to stop
sleep 2

# Start backend server
echo "🔧 Starting backend server..."
cd server && node index.js > ../server.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Check if backend is running
if curl -s http://localhost:3003/health > /dev/null; then
    echo "✅ Backend server started successfully (PID: $BACKEND_PID)"
    echo "   🌐 Backend URL: http://localhost:3003"
    echo "   💚 Health Check: http://localhost:3003/health"
else
    echo "❌ Backend server failed to start"
    exit 1
fi

# Start frontend
echo "🎨 Starting frontend..."
npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait for frontend to start
sleep 5

# Check if frontend is running
if curl -s -I http://localhost:5173 | grep -q "200 OK"; then
    echo "✅ Frontend started successfully (PID: $FRONTEND_PID)"
    echo "   🌐 Frontend URL: http://localhost:5173"
else
    echo "❌ Frontend failed to start"
    exit 1
fi

echo ""
echo "🎉 Bharat Biz-Agent is now running!"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  🌐 Frontend:     http://localhost:5173                    ║"
echo "║  🔧 Backend:      http://localhost:3003                    ║"
echo "║  💚 Health:       http://localhost:3003/health             ║"
echo "║  📊 API Stats:    http://localhost:3003/api/stats            ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "📋 Process IDs:"
echo "   Backend: $BACKEND_PID"
echo "   Frontend: $FRONTEND_PID"
echo ""
echo "🛑 To stop: kill $BACKEND_PID $FRONTEND_PID"
echo "📝 Logs: tail -f server.log frontend.log"
