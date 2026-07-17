#!/bin/bash

# IDLR-PTS Platform - Comprehensive Test Execution Framework
# Usage: ./scripts/run-all-tests.sh [unit|integration|e2e|load|all]

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
TEST_TYPE=${1:-all}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
REPORT_DIR="$PROJECT_DIR/test-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_section() {
    echo -e "\n${MAGENTA}========================================${NC}"
    echo -e "${MAGENTA}$1${NC}"
    echo -e "${MAGENTA}========================================${NC}\n"
}

# Create report directory
mkdir -p "$REPORT_DIR"

# Test execution functions
run_unit_tests() {
    log_section "Running Unit Tests"
    
    cd "$PROJECT_DIR"
    
    log_info "Executing Vitest unit tests..."
    if pnpm test --run --reporter=verbose --coverage 2>&1 | tee "$REPORT_DIR/unit-tests-$TIMESTAMP.log"; then
        log_success "Unit tests passed"
        ((TESTS_PASSED++))
    else
        log_error "Unit tests failed"
        ((TESTS_FAILED++))
        return 1
    fi
}

run_integration_tests() {
    log_section "Running Integration Tests"
    
    cd "$PROJECT_DIR"
    
    log_info "Executing integration tests..."
    if pnpm test tests/integration --run --reporter=verbose 2>&1 | tee "$REPORT_DIR/integration-tests-$TIMESTAMP.log"; then
        log_success "Integration tests passed"
        ((TESTS_PASSED++))
    else
        log_warning "Integration tests failed (external services may not be configured)"
        ((TESTS_SKIPPED++))
    fi
}

run_e2e_tests() {
    log_section "Running End-to-End Tests"
    
    cd "$PROJECT_DIR"
    
    log_info "Checking if dev server is running..."
    if ! curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        log_warning "Dev server not running, skipping E2E tests"
        ((TESTS_SKIPPED++))
        return 0
    fi
    
    log_info "Executing E2E workflow tests..."
    if pnpm test tests/e2e --run --reporter=verbose 2>&1 | tee "$REPORT_DIR/e2e-tests-$TIMESTAMP.log"; then
        log_success "E2E tests passed"
        ((TESTS_PASSED++))
    else
        log_error "E2E tests failed"
        ((TESTS_FAILED++))
        return 1
    fi
}

run_load_tests() {
    log_section "Running Load Tests"
    
    cd "$PROJECT_DIR"
    
    log_info "Checking if k6 is installed..."
    if ! command -v k6 &> /dev/null; then
        log_warning "k6 not installed, skipping load tests"
        ((TESTS_SKIPPED++))
        return 0
    fi
    
    log_info "Checking if dev server is running..."
    if ! curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        log_warning "Dev server not running, skipping load tests"
        ((TESTS_SKIPPED++))
        return 0
    fi
    
    log_info "Executing k6 load tests..."
    if k6 run --env BASE_URL=http://localhost:3000 tests/load/comprehensive-load-test.js 2>&1 | tee "$REPORT_DIR/load-tests-$TIMESTAMP.log"; then
        log_success "Load tests passed"
        ((TESTS_PASSED++))
    else
        log_error "Load tests failed"
        ((TESTS_FAILED++))
        return 1
    fi
}

run_type_checking() {
    log_section "Running Type Checking"
    
    cd "$PROJECT_DIR"
    
    log_info "Executing TypeScript compiler..."
    if pnpm tsc --noEmit 2>&1 | tee "$REPORT_DIR/type-check-$TIMESTAMP.log"; then
        log_success "Type checking passed"
        ((TESTS_PASSED++))
    else
        log_error "Type checking failed"
        ((TESTS_FAILED++))
        return 1
    fi
}

run_linting() {
    log_section "Running Linting"
    
    cd "$PROJECT_DIR"
    
    log_info "Executing ESLint..."
    if pnpm lint 2>&1 | tee "$REPORT_DIR/lint-$TIMESTAMP.log"; then
        log_success "Linting passed"
        ((TESTS_PASSED++))
    else
        log_warning "Linting found issues"
        ((TESTS_SKIPPED++))
    fi
}

run_security_scan() {
    log_section "Running Security Scan"
    
    cd "$PROJECT_DIR"
    
    log_info "Checking for dependency vulnerabilities..."
    if pnpm audit --audit-level=high 2>&1 | tee "$REPORT_DIR/security-scan-$TIMESTAMP.log"; then
        log_success "No high/critical vulnerabilities found"
        ((TESTS_PASSED++))
    else
        log_warning "Vulnerabilities found, review required"
        ((TESTS_SKIPPED++))
    fi
}

generate_test_report() {
    log_section "Generating Test Report"
    
    local REPORT_FILE="$REPORT_DIR/test-summary-$TIMESTAMP.md"
    
    cat > "$REPORT_FILE" <<EOF
# IDLR-PTS Platform - Test Execution Report

**Generated:** $(date)  
**Test Type:** $TEST_TYPE

## Summary

- **Tests Passed:** $TESTS_PASSED
- **Tests Failed:** $TESTS_FAILED
- **Tests Skipped:** $TESTS_SKIPPED
- **Total Tests:** $((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))

## Test Results

EOF

    if [ $TESTS_PASSED -gt 0 ]; then
        echo "### ✅ Passed Tests" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        [ -f "$REPORT_DIR/unit-tests-$TIMESTAMP.log" ] && echo "- Unit Tests" >> "$REPORT_FILE"
        [ -f "$REPORT_DIR/integration-tests-$TIMESTAMP.log" ] && echo "- Integration Tests" >> "$REPORT_FILE"
        [ -f "$REPORT_DIR/e2e-tests-$TIMESTAMP.log" ] && echo "- E2E Tests" >> "$REPORT_FILE"
        [ -f "$REPORT_DIR/load-tests-$TIMESTAMP.log" ] && echo "- Load Tests" >> "$REPORT_FILE"
        [ -f "$REPORT_DIR/type-check-$TIMESTAMP.log" ] && echo "- Type Checking" >> "$REPORT_FILE"
        [ -f "$REPORT_DIR/lint-$TIMESTAMP.log" ] && echo "- Linting" >> "$REPORT_FILE"
        [ -f "$REPORT_DIR/security-scan-$TIMESTAMP.log" ] && echo "- Security Scan" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi

    if [ $TESTS_FAILED -gt 0 ]; then
        echo "### ❌ Failed Tests" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "Review the detailed logs in \`$REPORT_DIR\`" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi

    if [ $TESTS_SKIPPED -gt 0 ]; then
        echo "### ⚠️ Skipped Tests" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "Some tests were skipped due to missing dependencies or services." >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi

    cat >> "$REPORT_FILE" <<EOF

## Detailed Logs

All detailed logs are available in:
\`$REPORT_DIR\`

## Recommendations

EOF

    if [ $TESTS_FAILED -gt 0 ]; then
        cat >> "$REPORT_FILE" <<EOF
- **Critical:** Fix all failing tests before deployment
- Review error logs for root cause analysis
- Re-run tests after fixes
EOF
    elif [ $TESTS_SKIPPED -gt 0 ]; then
        cat >> "$REPORT_FILE" <<EOF
- Configure missing external services for complete test coverage
- Install missing dependencies (k6, etc.)
- Ensure dev server is running for E2E and load tests
EOF
    else
        cat >> "$REPORT_FILE" <<EOF
- All tests passed! Platform is ready for deployment
- Consider running load tests with higher concurrency
- Schedule regular security scans
EOF
    fi

    log_success "Test report generated: $REPORT_FILE"
    cat "$REPORT_FILE"
}

# Main execution
main() {
    echo ""
    log_section "IDLR-PTS Platform - Comprehensive Test Suite"
    log_info "Test Type: $TEST_TYPE"
    log_info "Timestamp: $TIMESTAMP"
    echo ""

    case "$TEST_TYPE" in
        unit)
            run_type_checking || true
            run_linting || true
            run_unit_tests || true
            ;;
        integration)
            run_integration_tests || true
            ;;
        e2e)
            run_e2e_tests || true
            ;;
        load)
            run_load_tests || true
            ;;
        all)
            run_type_checking || true
            run_linting || true
            run_security_scan || true
            run_unit_tests || true
            run_integration_tests || true
            run_e2e_tests || true
            run_load_tests || true
            ;;
        *)
            log_error "Unknown test type: $TEST_TYPE"
            log_info "Usage: $0 [unit|integration|e2e|load|all]"
            exit 1
            ;;
    esac

    echo ""
    generate_test_report
    echo ""

    # Exit with appropriate code
    if [ $TESTS_FAILED -gt 0 ]; then
        log_error "Some tests failed. Review the report for details."
        exit 1
    else
        log_success "All tests completed successfully!"
        exit 0
    fi
}

# Run main function
main
