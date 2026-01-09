#!/usr/bin/env node

/**
 * CLI script to upload paywall HTML files for pattern analysis
 * Usage: node upload-paywall.js <file1.html> [file2.html] [file3.html] ...
 * Or: node upload-paywall.js --directory <directory>
 */

const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const axios = require("axios");

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";

async function uploadPaywall(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      return false;
    }

    const form = new FormData();
    form.append("paywall", fs.createReadStream(filePath), {
      filename: path.basename(filePath),
      contentType: "text/html",
    });

    console.log(`Uploading: ${filePath}...`);
    const response = await axios.post(
      `${API_BASE_URL}/api/upload-paywall`,
      form,
      {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    if (response.data.success) {
      console.log(`✓ Successfully analyzed: ${path.basename(filePath)}`);
      console.log(
        `  Colors: ${response.data.extractedPatterns.colors.length}, Fonts: ${response.data.extractedPatterns.fonts.length}`
      );
      return true;
    } else {
      console.error(`✗ Failed to analyze: ${path.basename(filePath)}`);
      return false;
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.message.includes('connect')) {
      console.error(
        `✗ Error uploading ${path.basename(filePath)}: Server not running. Please start the server with 'npm start' or 'npm run dev'`
      );
    } else if (error.response) {
      console.error(
        `✗ Error uploading ${path.basename(filePath)}:`,
        error.response.data?.error || error.response.statusText || error.message
      );
    } else {
      console.error(
        `✗ Error uploading ${path.basename(filePath)}:`,
        error.message
      );
    }
    return false;
  }
}

async function uploadDirectory(dirPath) {
  try {
    const files = fs
      .readdirSync(dirPath)
      .filter(
        (file) =>
          file.endsWith(".html") || file.endsWith(".htm")
      )
      .map((file) => path.join(dirPath, file));

    if (files.length === 0) {
      console.error(`No HTML files found in: ${dirPath}`);
      return;
    }

    console.log(`Found ${files.length} HTML file(s) in ${dirPath}`);
    let successCount = 0;

    for (const file of files) {
      const success = await uploadPaywall(file);
      if (success) successCount++;
    }

    console.log(`\n✓ Successfully analyzed ${successCount} of ${files.length} paywalls`);
  } catch (error) {
    console.error(`Error reading directory: ${error.message}`);
  }
}

async function checkServer() {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/health`, {
      timeout: 2000,
    });
    return response.data.status === 'ok';
  } catch (error) {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  // Check if server is running (skip check for --patterns as it will show error anyway)
  if (args[0] !== "--patterns" && args[0] !== "-p") {
    const serverRunning = await checkServer();
    if (!serverRunning) {
      console.error(`\n✗ Error: Server is not running at ${API_BASE_URL}`);
      console.error(`   Please start the server first:`);
      console.error(`   cd backend && npm start\n`);
      process.exit(1);
    }
  }

  if (args.length === 0) {
    console.log(`
Usage:
  node upload-paywall.js <file1.html> [file2.html] ...
  node upload-paywall.js --directory <directory>
  node upload-paywall.js --patterns (view current patterns)

Examples:
  node upload-paywall.js paywall1.html paywall2.html
  node upload-paywall.js --directory ./paywalls
  node upload-paywall.js --patterns
`);
    process.exit(1);
  }

  if (args[0] === "--directory" || args[0] === "-d") {
    if (!args[1]) {
      console.error("Error: Directory path required");
      process.exit(1);
    }
    await uploadDirectory(args[1]);
  } else if (args[0] === "--patterns" || args[0] === "-p") {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/paywall-patterns`);
      const { patterns, summary } = response.data;
      console.log("\n=== Current Paywall Patterns ===");
      console.log(`Total Paywalls Analyzed: ${summary.totalPaywallsAnalyzed}`);
      console.log(`\nColors (${summary.colors}):`);
      console.log(patterns.colors.slice(0, 10).join(", "));
      console.log(`\nFonts (${summary.fonts}):`);
      console.log(patterns.fonts.slice(0, 10).join(", "));
      console.log(`\nSpacing (${summary.spacing}):`);
      console.log(patterns.spacing.slice(0, 10).join("px, ") + "px");
      console.log(`\nBorder Radius (${summary.borderRadius}):`);
      console.log(patterns.borderRadius.slice(0, 10).join("px, ") + "px");
    } catch (error) {
      console.error(
        "Error fetching patterns:",
        error.response?.data?.error || error.message
      );
      process.exit(1);
    }
  } else {
    // Upload individual files
    let successCount = 0;
    for (const filePath of args) {
      const success = await uploadPaywall(filePath);
      if (success) successCount++;
    }

    if (successCount > 0) {
      console.log(`\n✓ Successfully analyzed ${successCount} of ${args.length} paywall(s)`);
      console.log(
        `\nView patterns: node upload-paywall.js --patterns`
      );
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});

