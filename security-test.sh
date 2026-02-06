#!/bin/bash

# Security Testing Script for Bharat Biz-Agent
# Tests all security enhancements and validates configurations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_TESTS=0

# Functions
log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
    ((TOTAL_TESTS++))
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

# Test 1: Security Headers
test_security_headers() {
    log_test "Testing Security Headers"
    
    response=$(curl -s -I http://localhost:3002/health 2>/dev/null || echo "")
    
    if echo "$response" | grep -q "X-Content-Type-Options"; then
        log_pass "X-Content-Type-Options header present"
    else
        log_fail "X-Content-Type-Options header missing"
    fi
    
    if echo "$response" | grep -q "X-Frame-Options"; then
        log_pass "X-Frame-Options header present"
    else
        log_fail "X-Frame-Options header missing"
    fi
    
    if echo "$response" | grep -q "Strict-Transport-Security"; then
        log_pass "HSTS header present"
    else
        log_fail "HSTS header missing"
    fi
    
    if echo "$response" | grep -q "Content-Security-Policy"; then
        log_pass "CSP header present"
    else
        log_fail "CSP header missing"
    fi
}

# Test 2: Rate Limiting
test_rate_limiting() {
    log_test "Testing Rate Limiting"
    
    # Test general rate limiting
    success_count=0
    for i in {1..5}; do
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/api/orders | grep -q "200"; then
            ((success_count++))
        fi
    done
    
    if [ $success_count -eq 5 ]; then
        log_pass "Rate limiting allows normal requests"
    else
        log_fail "Rate limiting blocking legitimate requests"
    fi
    
    # Test with invalid API key
    response=$(curl -s -w "%{http_code}" -o /dev/null -H "Authorization: Bearer invalid" http://localhost:3002/api/orders)
    if [ "$response" = "401" ]; then
        log_pass "Invalid API key properly rejected"
    else
        log_fail "Invalid API key not rejected (HTTP $response)"
    fi
}

# Test 3: Input Validation
test_input_validation() {
    log_test "Testing Input Validation"
    
    # Test SQL injection attempt
    response=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
        -H "Authorization: Bearer $ADMIN_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"customerId":"test","items":[{"product":"<script>alert(1)</script>","quantity":1,"unit":"kg","price":10}]}' \
        http://localhost:3002/api/orders)
    
    if [ "$response" = "400" ]; then
        log_pass "Malicious input rejected"
    else
        log_fail "Malicious input not rejected (HTTP $response)"
    fi
    
    # Test XSS attempt
    response=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
        -H "Authorization: Bearer $ADMIN_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"message":"<img src=x onerror=alert(1)>","type":"text","platform":"web"}' \
        http://localhost:3002/api/test-ai)
    
    if [ "$response" = "400" ]; then
        log_pass "XSS attempt rejected"
    else
        log_fail "XSS attempt not rejected (HTTP $response)"
    fi
}

# Test 4: File Upload Security
test_file_upload_security() {
    log_test "Testing File Upload Security"
    
    # Create test file
    echo "<script>alert(1)</script>" > /tmp/test_malicious.txt
    
    # Test malicious file upload
    response=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
        -H "Authorization: Bearer $ADMIN_API_KEY" \
        -F "audio=@/tmp/test_malicious.txt" \
        http://localhost:3002/api/voice/transcribe)
    
    if [ "$response" = "400" ]; then
        log_pass "Malicious file upload rejected"
    else
        log_fail "Malicious file upload not rejected (HTTP $response)"
    fi
    
    # Clean up
    rm -f /tmp/test_malicious.txt
}

# Test 5: Error Handling
test_error_handling() {
    log_test "Testing Error Handling"
    
    # Test non-existent endpoint
    response=$(curl -s -w "%{http_code}" -o /dev/null http://localhost:3002/api/nonexistent)
    if [ "$response" = "404" ]; then
        log_pass "404 error properly handled"
    else
        log_fail "404 error not handled (HTTP $response)"
    fi
    
    # Test malformed JSON
    response=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
        -H "Authorization: Bearer $ADMIN_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"invalid": json}' \
        http://localhost:3002/api/orders)
    
    if [ "$response" = "400" ]; then
        log_pass "Malformed JSON properly handled"
    else
        log_fail "Malformed JSON not handled (HTTP $response)"
    fi
}

# Test 6: Authentication Security
test_authentication_security() {
    log_test "Testing Authentication Security"
    
    # Test missing API key
    response=$(curl -s -w "%{http_code}" -o /dev/null http://localhost:3002/api/orders)
    if [ "$response" = "401" ]; then
        log_pass "Missing API key rejected"
    else
        log_fail "Missing API key not rejected (HTTP $response)"
    fi
    
    # Test malformed API key
    response=$(curl -s -w "%{http_code}" -o /dev/null -H "Authorization: Invalid" http://localhost:3002/api/orders)
    if [ "$response" = "401" ]; then
        log_pass "Malformed API key rejected"
    else
        log_fail "Malformed API key not rejected (HTTP $response)"
    fi
    
    # Test short API key
    response=$(curl -s -w "%{http_code}" -o /dev/null -H "Authorization: Bearer short" http://localhost:3002/api/orders)
    if [ "$response" = "401" ]; then
        log_pass "Short API key rejected"
    else
        log_fail "Short API key not rejected (HTTP $response)"
    fi
}

# Test 7: CORS Configuration
test_cors_configuration() {
    log_test "Testing CORS Configuration"
    
    # Test preflight request
    response=$(curl -s -w "%{http_code}" -o /dev/null -X OPTIONS \
        -H "Origin: http://malicious.com" \
        -H "Access-Control-Request-Method: POST" \
        -H "Access-Control-Request-Headers: Content-Type" \
        http://localhost:3002/api/orders)
    
    if [ "$response" = "403" ] || [ "$response" = "404" ]; then
        log_pass "CORS properly configured"
    else
        log_fail "CORS may be misconfigured (HTTP $response)"
    fi
}

# Test 8: Health Check Security
test_health_check_security() {
    log_test "Testing Health Check Security"
    
    # Health check should not require authentication
    response=$(curl -s -w "%{http_code}" -o /dev/null http://localhost:3002/health)
    if [ "$response" = "200" ]; then
        log_pass "Health endpoint accessible"
    else
        log_fail "Health endpoint not accessible (HTTP $response)"
    fi
    
    # Check health response structure
    health_data=$(curl -s http://localhost:3002/health)
    if echo "$health_data" | grep -q '"status"'; then
        log_pass "Health response properly structured"
    else
        log_fail "Health response structure invalid"
    fi
}

# Test 9: Database Security
test_database_security() {
    log_test "Testing Database Security"
    
    # Test injection attempt in order ID
    response=$(curl -s -w "%{http_code}" -o /dev/null \
        -H "Authorization: Bearer $ADMIN_API_KEY" \
        "http://localhost:3002/api/orders/\$where")
    
    if [ "$response" = "404" ] || [ "$response" = "400" ]; then
        log_pass "Database injection attempt blocked"
    else
        log_fail "Database injection attempt not blocked (HTTP $response)"
    fi
}

# Test 10: Request Size Limits
test_request_size_limits() {
    log_test "Testing Request Size Limits"
    
    # Create large payload
    large_payload=$(python3 -c "import json; print(json.dumps({'data': 'x' * 10000000}))")
    
    response=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
        -H "Authorization: Bearer $ADMIN_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$large_payload" \
        http://localhost:3002/api/test-ai)
    
    if [ "$response" = "413" ] || [ "$response" = "400" ]; then
        log_pass "Large request properly rejected"
    else
        log_fail "Large request not rejected (HTTP $response)"
    fi
}

# Test 11: Security Monitoring
test_security_monitoring() {
    log_test "Testing Security Monitoring"
    
    # Generate some security events
    curl -s -o /dev/null -H "Authorization: Bearer invalid" http://localhost:3002/api/orders > /dev/null 2>&1
    
    # Check if security logs are being created
    if [ -f "server/logs/security.log" ]; then
        log_pass "Security logs are being generated"
    else
        log_fail "Security logs not found"
    fi
    
    # Check error logs
    if [ -f "server/logs/errors.log" ]; then
        log_pass "Error logs are being generated"
    else
        log_fail "Error logs not found"
    fi
}

# Test 12: AI Service Security
test_ai_service_security() {
    log_test "Testing AI Service Security"
    
    # Test AI service with malicious input
    response=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
        -H "Authorization: Bearer $ADMIN_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"message":"<script>document.location=\"http://evil.com\"</script>"}' \
        http://localhost:3002/api/test-ai)
    
    if [ "$response" = "400" ]; then
        log_pass "AI service rejects malicious input"
    else
        log_fail "AI service accepts malicious input (HTTP $response)"
    fi
}

# Main test execution
main() {
    echo -e "${BLUE}🔒 Bharat Biz-Agent Security Testing${NC}"
    echo "=================================="
    
    # Check if server is running
    if ! curl -s http://localhost:3002/health > /dev/null 2>&1; then
        echo -e "${RED}❌ Server is not running on localhost:3002${NC}"
        echo "Please start the server before running security tests"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Server is running, starting security tests...${NC}"
    echo ""
    
    # Run all tests
    test_security_headers
    test_rate_limiting
    test_input_validation
    test_file_upload_security
    test_error_handling
    test_authentication_security
    test_cors_configuration
    test_health_check_security
    test_database_security
    test_request_size_limits
    test_security_monitoring
    test_ai_service_security
    
    # Results
    echo ""
    echo "=================================="
    echo -e "${BLUE}Security Test Results:${NC}"
    echo -e "Total Tests: $TOTAL_TESTS"
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}🎉 All security tests passed!${NC}"
        echo -e "${GREEN}✅ Application is secure and ready for production${NC}"
        exit 0
    else
        echo -e "${RED}⚠️  Some security tests failed${NC}"
        echo -e "${RED}❌ Please review and fix security issues before deployment${NC}"
        exit 1
    fi
}

# Run tests
main "$@"
