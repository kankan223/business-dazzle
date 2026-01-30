#!/bin/sh

# Bharat Biz-Agent Docker Entrypoint

echo "
╔══════════════════════════════════════════════════════════╗
║          Bharat Biz-Agent - Starting Services            ║
╚══════════════════════════════════════════════════════════╝
"

# Check required environment variables
if [ -z "$ENCRYPTION_KEY" ]; then
    echo "⚠️  Warning: ENCRYPTION_KEY not set. Generating random key..."
    export ENCRYPTION_KEY=$(openssl rand -hex 32)
    echo "🔑 Generated encryption key"
fi

# Start backend server
echo "🚀 Starting backend server..."
cd /app/server
node index.js &
BACKEND_PID=$!

# Wait for backend to be ready
echo "⏳ Waiting for backend to be ready..."
for i in 1 2 3 4 5; do
    if wget --spider -q http://localhost:3001/health 2>/dev/null; then
        echo "✅ Backend is ready"
        break
    fi
    sleep 1
done

# Start nginx
echo "🌐 Starting nginx..."
nginx -g 'daemon off;' &
NGINX_PID=$!

echo "
╔══════════════════════════════════════════════════════════╗
║          Bharat Biz-Agent - Ready!                       ║
║                                                          ║
║  🌐 Frontend: http://localhost                           ║
║  🔌 API:      http://localhost/api                       ║
║  💚 Health:   http://localhost/health                    ║
╚══════════════════════════════════════════════════════════╝
"

# Handle shutdown gracefully
shutdown() {
    echo "
🛑 Shutting down services..."
    kill $BACKEND_PID 2>/dev/null
    kill $NGINX_PID 2>/dev/null
    exit 0
}

trap shutdown SIGTERM SIGINT

# Keep container running
wait
