# ================================
# BLE Attendance Backend - Dockerfile
# For deployment on Northflank
# ================================

FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies for native modules (sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files first (for better caching)
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy application code
COPY . .

# Remove development files
RUN rm -rf .env .env.example .git tests scripts/*.test.js

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port (Northflank will map this)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the server
CMD ["node", "server.js"]
