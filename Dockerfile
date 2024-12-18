# Use the official Node.js 20 image as a parent image
FROM node:20

# Install necessary dependencies
RUN apt-get update && \
    apt-get install -y wget gnupg curl git && \
    apt-get install -y \
    libgbm-dev \
    libgtk-3-0 \
    libasound2 \
    libnss3 \
    libxss1 \
    fonts-liberation \
    libappindicator3-1 \
    libatk-bridge2.0-0 \
    libxkbcommon0 \
    libglu1-mesa && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install XVFB for headless browser support
RUN apt-get update && apt-get install -y xvfb

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy your application files into the container
COPY . .

# Install Playwright globally and all supported browsers with dependencies
RUN npm install -g playwright && \
    npx playwright install --with-deps

# Set up XVFB to run Playwright scripts
CMD ["sh", "-c", "xvfb-run --server-args='-screen 0 1024x768x24' npx playwright test"]
