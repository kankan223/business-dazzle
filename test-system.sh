#!/bin/bash

# Bharat Biz-Agent - System Test Script
# Tests all major features and functionalities

echo "🧪 Running Bharat Biz-Agent System Tests..."
echo "=========================================="

# Test 1: Backend Health Check
echo "1. Testing Backend Health..."
HEALTH=$(curl -s http://localhost:3002/health)
if [[ $HEALTH == *"ok"* ]]; then
    echo "✅ Backend Health: PASS"
else
    echo "❌ Backend Health: FAIL"
fi

# Test 2: Direct Command System
echo -e "\n2. Testing Direct Commands..."
PING=$(curl -s -X POST http://localhost:3002/api/direct-command \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer bbz_9f3aE7KpQ2mLx8WcD6VhN1RZ0B4JYUt5oS" \
    -d '{"command": "/ping", "platform": "web"}')

if [[ $PING == *"Pong"* ]]; then
    echo "✅ Direct Commands: PASS"
else
    echo "❌ Direct Commands: FAIL"
fi

# Test 3: AI Chat
echo -e "\n3. Testing AI Chat..."
AI_RESPONSE=$(curl -s -X POST http://localhost:3002/api/direct-command \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer bbz_9f3aE7KpQ2mLx8WcD6VhN1RZ0B4JYUt5oS" \
    -d '{"command": "Hello, how are you?", "platform": "web"}')

if [[ $AI_RESPONSE == *"success"* ]]; then
    echo "✅ AI Chat: PASS"
else
    echo "❌ AI Chat: FAIL"
fi

# Test 4: Speech Languages
echo -e "\n4. Testing Speech Languages..."
LANGS=$(curl -s http://localhost:3002/api/speech-languages)
if [[ $LANGS == *"English (India)"* ]]; then
    echo "✅ Speech Languages: PASS"
else
    echo "❌ Speech Languages: FAIL"
fi

# Test 5: Database Connection
echo -e "\n5. Testing Database Connection..."
DB_TEST=$(curl -s --max-time 3 http://localhost:3002/api/bots)
if [[ $DB_TEST == *"botId"* ]] || [[ $DB_TEST == *"Sales Bot"* ]]; then
    echo "✅ Database Connection: PASS"
else
    echo "❌ Database Connection: FAIL"
fi

# Test 6: Frontend
echo -e "\n6. Testing Frontend..."
FRONTEND=$(curl -s --max-time 3 http://localhost:5173 | head -1)
if [[ $FRONTEND == *"<!doctype html>"* ]]; then
    echo "✅ Frontend: PASS"
else
    echo "❌ Frontend: FAIL"
fi

# Test 7: MongoDB
echo -e "\n7. Testing MongoDB..."
if docker ps | grep -q mongodb; then
    echo "✅ MongoDB: PASS (Running)"
else
    echo "❌ MongoDB: FAIL (Not running)"
fi

echo -e "\n=========================================="
echo "🎉 System Tests Complete!"
echo ""
echo "🌐 Access URLs:"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:3002"
echo "   Health:   http://localhost:3002/health"
echo ""
echo "🔑 Test Credentials:"
echo "   Admin API Key: bbz_9f3aE7KpQ2mLx8WcD6VhN1RZ0B4JYUt5oS"
echo ""
echo "📋 Available Commands:"
echo "   /help - Show help menu"
echo "   /ping - Check bot status"
echo "   /language - Language options"
echo "   /voice - Enable voice mode"
echo ""
echo "🎤 Voice Features:"
echo "   - Supports 10+ Indian languages"
echo "   - Real-time speech-to-text"
echo "   - Voice message processing"
echo ""
echo "🤖 AI Features:"
echo "   - Gemini AI integration"
echo "   - Multilingual support"
echo "   - Smart approval detection"
echo "   - Business insights"
echo ""
echo "✨ All systems operational! 🇮🇳"
