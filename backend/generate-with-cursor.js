const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const axios = require("axios");
const sharp = require("sharp");

/**
 * Fix image paths in generated HTML to use original URLs or base64
 */
async function fixImagePaths(html, generationDir, appInfo) {
  const imagesDir = path.join(generationDir, "images");
  
  // Find all image references in the HTML
  // Match patterns like: src="../images/icon.jpg", src="../images/screenshot1.webp", etc.
  const imagePathRegex = /src=["']([^"']*\.\.\/images\/[^"']+)["']/gi;
  
  let fixedHtml = html;
  let match;
  
  while ((match = imagePathRegex.exec(html)) !== null) {
    const relativePath = match[1]; // e.g., "../images/icon.jpg"
    const imageFileName = path.basename(relativePath); // e.g., "icon.jpg"
    const localImagePath = path.join(imagesDir, imageFileName);
    
    console.log(`🖼️  Found image reference: ${relativePath}`);
    
    // Try to find the corresponding original URL
    let originalUrl = null;
    
    // Check if it's the icon
    if (imageFileName.toLowerCase().startsWith("icon")) {
      originalUrl = appInfo.icon;
    } 
    // Check if it's a screenshot
    else if (imageFileName.toLowerCase().includes("screenshot")) {
      const screenshotIndex = parseInt(imageFileName.match(/\d+/)?.[0]) - 1;
      if (screenshotIndex >= 0 && appInfo.screenshots && appInfo.screenshots[screenshotIndex]) {
        originalUrl = appInfo.screenshots[screenshotIndex];
      }
    }
    
    // Replace with original URL if available, otherwise try to convert to base64
    if (originalUrl) {
      console.log(`   → Replacing with original URL: ${originalUrl}`);
      fixedHtml = fixedHtml.replace(match[0], `src="${originalUrl}"`);
    } else if (fs.existsSync(localImagePath)) {
      // Convert to base64 if original URL not available
      try {
        const imageBuffer = fs.readFileSync(localImagePath);
        const ext = path.extname(imageFileName).toLowerCase().slice(1);
        const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
                        ext === "png" ? "image/png" :
                        ext === "webp" ? "image/webp" :
                        ext === "gif" ? "image/gif" : "image/png";
        const base64 = imageBuffer.toString("base64");
        const dataUri = `data:${mimeType};base64,${base64}`;
        console.log(`   → Converting to base64 data URI (${(imageBuffer.length / 1024).toFixed(1)}KB)`);
        fixedHtml = fixedHtml.replace(match[0], `src="${dataUri}"`);
      } catch (error) {
        console.warn(`   ⚠️  Could not convert ${localImagePath} to base64: ${error.message}`);
        // Keep the original path, maybe it will work in some contexts
      }
    } else {
      console.warn(`   ⚠️  Image file not found: ${localImagePath}`);
    }
  }
  
  // Also replace any references in CSS (background-image, etc.)
  const cssImageRegex = /url\(["']?([^"')]*\.\.\/images\/[^"')]+)["']?\)/gi;
  let cssMatch;
  while ((cssMatch = cssImageRegex.exec(html)) !== null) {
    const relativePath = cssMatch[1];
    const imageFileName = path.basename(relativePath);
    const localImagePath = path.join(imagesDir, imageFileName);
    
    let originalUrl = null;
    if (imageFileName.toLowerCase().startsWith("icon")) {
      originalUrl = appInfo.icon;
    } else if (imageFileName.toLowerCase().includes("screenshot")) {
      const screenshotIndex = parseInt(imageFileName.match(/\d+/)?.[0]) - 1;
      if (screenshotIndex >= 0 && appInfo.screenshots && appInfo.screenshots[screenshotIndex]) {
        originalUrl = appInfo.screenshots[screenshotIndex];
      }
    }
    
    if (originalUrl) {
      fixedHtml = fixedHtml.replace(cssMatch[0], `url("${originalUrl}")`);
    } else if (fs.existsSync(localImagePath)) {
      try {
        const imageBuffer = fs.readFileSync(localImagePath);
        const ext = path.extname(imageFileName).toLowerCase().slice(1);
        const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
                        ext === "png" ? "image/png" :
                        ext === "webp" ? "image/webp" :
                        ext === "gif" ? "image/gif" : "image/png";
        const base64 = imageBuffer.toString("base64");
        const dataUri = `data:${mimeType};base64,${base64}`;
        fixedHtml = fixedHtml.replace(cssMatch[0], `url("${dataUri}")`);
      } catch (error) {
        console.warn(`   ⚠️  Could not convert ${localImagePath} to base64 for CSS: ${error.message}`);
      }
    }
  }
  
  return fixedHtml;
}

/**
 * Download image from URL to local file
 */
async function downloadImage(imageUrl, outputPath) {
  try {
    console.log(`📥 Downloading image: ${imageUrl}`);
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });

    fs.writeFileSync(outputPath, Buffer.from(response.data));
    console.log(`✅ Downloaded to: ${outputPath}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to download ${imageUrl}:`, error.message);
    return false;
  }
}

/**
 * Extract dominant colors from an image using sharp
 */
async function extractColorsFromImage(imagePath) {
  try {
    // Resize image for faster processing
    const { data, info } = await sharp(imagePath)
      .resize(200, 200, { fit: "inside", withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = [];
    const width = info.width;
    const height = info.height;
    const channels = info.channels;

    // Sample pixels (every nth pixel for performance)
    const sampleRate = Math.max(1, Math.floor((width * height) / 5000));
    for (let i = 0; i < data.length; i += channels * sampleRate) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Skip pure black/white and very transparent pixels
      if (
        (r === 0 && g === 0 && b === 0) ||
        (r === 255 && g === 255 && b === 255)
      ) {
        continue;
      }

      pixels.push([r, g, b]);
    }

    if (pixels.length === 0) {
      return null;
    }

    // K-means clustering to find dominant colors
    const k = 8; // Number of clusters
    const clusters = kMeansClustering(pixels, k);

    // Sort by frequency and get top colors
    const colors = clusters
      .map((cluster) => {
        const hex = rgbToHex(
          cluster.color[0],
          cluster.color[1],
          cluster.color[2]
        );
        const brightness = getBrightness(
          cluster.color[0],
          cluster.color[1],
          cluster.color[2]
        );
        return {
          hex: hex.toUpperCase(),
          rgb: cluster.color,
          brightness,
          count: cluster.count,
        };
      })
      .filter((c) => c.brightness > 30 && c.brightness < 240) // Filter very dark/light
      .sort((a, b) => b.count - a.count);

    if (colors.length === 0) {
      return null;
    }

    return colors.slice(0, 8); // Return top 8 colors
  } catch (error) {
    console.error(
      `❌ Error extracting colors from ${imagePath}:`,
      error.message
    );
    return null;
  }
}

/**
 * Simple K-means clustering for color extraction
 */
function kMeansClustering(pixels, k) {
  // Initialize centroids randomly
  let centroids = [];
  for (let i = 0; i < k; i++) {
    const randomPixel = pixels[Math.floor(Math.random() * pixels.length)];
    centroids.push([...randomPixel]);
  }

  let clusters = [];
  let iterations = 0;
  const maxIterations = 10;

  while (iterations < maxIterations) {
    // Assign pixels to nearest centroid
    clusters = centroids.map(() => ({
      color: [0, 0, 0],
      count: 0,
      pixels: [],
    }));

    pixels.forEach((pixel) => {
      let minDist = Infinity;
      let closestCluster = 0;

      centroids.forEach((centroid, idx) => {
        const dist = colorDistance(pixel, centroid);
        if (dist < minDist) {
          minDist = dist;
          closestCluster = idx;
        }
      });

      clusters[closestCluster].pixels.push(pixel);
      clusters[closestCluster].count++;
    });

    // Update centroids
    let changed = false;
    centroids = clusters.map((cluster, idx) => {
      if (cluster.count === 0) {
        return centroids[idx]; // Keep old centroid if no pixels
      }

      const sum = cluster.pixels.reduce(
        (acc, pixel) => [
          acc[0] + pixel[0],
          acc[1] + pixel[1],
          acc[2] + pixel[2],
        ],
        [0, 0, 0]
      );
      const newCentroid = [
        Math.round(sum[0] / cluster.count),
        Math.round(sum[1] / cluster.count),
        Math.round(sum[2] / cluster.count),
      ];

      if (colorDistance(newCentroid, centroids[idx]) > 1) {
        changed = true;
      }

      cluster.color = newCentroid;
      return newCentroid;
    });

    if (!changed) break;
    iterations++;
  }

  return clusters.filter((c) => c.count > 0);
}

/**
 * Calculate color distance (Euclidean in RGB space)
 */
function colorDistance(c1, c2) {
  return Math.sqrt(
    Math.pow(c1[0] - c2[0], 2) +
      Math.pow(c1[1] - c2[1], 2) +
      Math.pow(c1[2] - c2[2], 2)
  );
}

/**
 * Convert RGB to hex
 */
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Calculate brightness (perceived luminance)
 */
function getBrightness(r, g, b) {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/**
 * Analyze colors from screenshots using image processing
 */
async function extractColorsFromScreenshots(generationDir) {
  const imagesDir = path.join(generationDir, "images");

  if (!fs.existsSync(imagesDir)) {
    console.log("⚠️ Images directory not found");
    return null;
  }

  // Separate logo and screenshots for different purposes
  const allFiles = fs
    .readdirSync(imagesDir)
    .filter((f) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));

  const screenshotFiles = allFiles.filter((f) =>
    f.toLowerCase().includes("screenshot")
  );
  const iconFile = allFiles.find((f) => f.toLowerCase().includes("icon"));

  if (allFiles.length === 0) {
    console.log("⚠️ No images found for color analysis");
    return null;
  }

  console.log(`🎨 Extracting colors from images using image processing...`);

  // PRIORITY 1: Extract brand colors from logo/icon (primary, secondary, accent)
  let logoColors = [];
  if (iconFile) {
    const iconPath = path.join(imagesDir, iconFile);
    const colors = await extractColorsFromImage(iconPath);
    if (colors && colors.length > 0) {
      logoColors = colors;
      console.log(
        `  ✓ Extracted ${colors.length} brand colors from logo (${iconFile})`
      );
    }
  }

  // PRIORITY 2: Extract theme and background colors from screenshots
  let screenshotColors = [];
  if (screenshotFiles.length > 0) {
    for (const screenshotFile of screenshotFiles.slice(0, 3)) {
      const screenshotPath = path.join(imagesDir, screenshotFile);
      const colors = await extractColorsFromImage(screenshotPath);
      if (colors && colors.length > 0) {
        screenshotColors.push(...colors);
      }
    }
    console.log(
      `  ✓ Extracted colors from ${screenshotFiles.length} screenshot(s)`
    );
  }

  // If no logo but we have screenshots, use first screenshot as fallback for brand colors
  if (logoColors.length === 0 && screenshotColors.length > 0) {
    logoColors = screenshotColors.slice(0, 8);
    console.log(`  ⚠️ No logo found, using screenshot colors for brand`);
  }

  if (logoColors.length === 0 && screenshotColors.length === 0) {
    console.log("⚠️ No colors extracted from images");
    return null;
  }

  // Aggregate logo colors (brand colors)
  const logoColorMap = new Map();
  logoColors.forEach((color) => {
    const key = color.hex;
    if (logoColorMap.has(key)) {
      logoColorMap.set(key, {
        ...color,
        count: logoColorMap.get(key).count + color.count,
      });
    } else {
      logoColorMap.set(key, color);
    }
  });

  // Aggregate screenshot colors (for theme detection)
  const screenshotColorMap = new Map();
  screenshotColors.forEach((color) => {
    const key = color.hex;
    if (screenshotColorMap.has(key)) {
      screenshotColorMap.set(key, {
        ...color,
        count: screenshotColorMap.get(key).count + color.count,
      });
    } else {
      screenshotColorMap.set(key, color);
    }
  });

  // Sort logo colors by frequency (these are brand colors)
  const sortedLogoColors = Array.from(logoColorMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Sort screenshot colors by frequency (for theme detection)
  const sortedScreenshotColors = Array.from(screenshotColorMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Determine theme (dark or light) from screenshot background colors
  const backgroundColors = sortedScreenshotColors.filter(
    (c) => c.brightness < 80 || c.brightness > 200
  );
  const isDarkTheme =
    backgroundColors.filter((c) => c.brightness < 80).length >
    backgroundColors.filter((c) => c.brightness > 200).length;

  // Select PRIMARY, SECONDARY, ACCENT from LOGO (brand colors)
  const primary =
    sortedLogoColors.find((c) => c.brightness > 50 && c.brightness < 220) ||
    sortedLogoColors[0];
  const secondary =
    sortedLogoColors.find(
      (c) =>
        c.hex !== primary.hex &&
        c.brightness > 50 &&
        c.brightness < 220 &&
        colorDistance(c.rgb, primary.rgb) > 40
    ) ||
    sortedLogoColors[1] ||
    primary;
  const accent =
    sortedLogoColors.find(
      (c) =>
        c.hex !== primary.hex &&
        c.hex !== secondary.hex &&
        (c.brightness > 150 || c.brightness < 100) &&
        colorDistance(c.rgb, primary.rgb) > 30
    ) ||
    sortedLogoColors[2] ||
    primary;

  // Background color - use from screenshots to match app theme
  let background;
  if (screenshotColors.length > 0) {
    if (isDarkTheme) {
      const darkBg =
        sortedScreenshotColors.find((c) => c.brightness < 50) ||
        sortedScreenshotColors.find((c) => c.brightness < 80);
      if (darkBg) {
        background = darkBg.hex;
      } else {
        // Create dark background based on primary color
        const r = Math.max(0, primary.rgb[0] - 60);
        const g = Math.max(0, primary.rgb[1] - 60);
        const b = Math.max(0, primary.rgb[2] - 60);
        background = rgbToHex(r, g, b).toUpperCase();
      }
    } else {
      const lightBg =
        sortedScreenshotColors.find((c) => c.brightness > 240) ||
        sortedScreenshotColors.find((c) => c.brightness > 200);
      background = lightBg ? lightBg.hex : "#FFFFFF";
    }
  } else {
    // No screenshots - infer from primary color
    if (isDarkTheme || primary.brightness < 150) {
      const r = Math.max(0, primary.rgb[0] - 60);
      const g = Math.max(0, primary.rgb[1] - 60);
      const b = Math.max(0, primary.rgb[2] - 60);
      background = rgbToHex(r, g, b).toUpperCase();
    } else {
      background = "#FFFFFF";
    }
  }

  // Text color based on background
  const bgBrightness = getBrightness(...hexToRgb(background || "#1A1A2E"));
  const text = bgBrightness < 128 ? "#FFFFFF" : "#2C3E50";

  // Gradient
  const gradient = `linear-gradient(135deg, ${primary.hex} 0%, ${secondary.hex} 100%)`;

  const palette = {
    primary: primary.hex,
    secondary: secondary.hex,
    accent: accent.hex,
    background: background || (isDarkTheme ? "#1A1A2E" : "#FFFFFF"),
    text: text,
    gradient: gradient,
  };

  console.log(`✅ Color palette extracted:`);
  console.log(`   Primary: ${palette.primary}`);
  console.log(`   Secondary: ${palette.secondary}`);
  console.log(`   Accent: ${palette.accent}`);
  console.log(
    `   Background: ${palette.background} (${
      isDarkTheme ? "dark" : "light"
    } theme)`
  );

  return palette;
}

/**
 * Convert hex to RGB
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ]
    : [26, 26, 46];
}

/**
 * Generate paywall using cursor-agent
 *
 * @param {Object} appInfo - App information object
 * @param {Object} businessModels - Business models object
 * @param {Object} options - Options including prompt, model, etc.
 * @returns {Promise<string>} Generated HTML code
 */
async function generatePaywallWithCursor(
  appInfo,
  businessModels,
  options = {}
) {
  const {
    model = "gemini-3-flash",
    customPrompt = null,
    outputDir = path.join(__dirname, "cursor-generations"),
    pageType = "paywall",
  } = options;

  // Create generation directory with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const generationDir = path.join(outputDir, `generation-${timestamp}`);
  fs.mkdirSync(generationDir, { recursive: true });

  console.log(`📁 Created generation directory: ${generationDir}`);

  // Download images locally for color analysis
  const imagesDir = path.join(generationDir, "images");
  fs.mkdirSync(imagesDir, { recursive: true });

  const downloadedImages = [];

  // Download app icon/logo (PRIORITY for brand colors)
  let iconDownloaded = false;
  if (appInfo.icon) {
    const iconExt = path.extname(appInfo.icon).split("?")[0] || ".png";
    const iconPath = path.join(imagesDir, `icon${iconExt}`);
    if (await downloadImage(appInfo.icon, iconPath)) {
      downloadedImages.push(`images/icon${iconExt}`);
      iconDownloaded = true;
      console.log(`✅ Downloaded app logo/icon for brand color extraction`);
    }
  }

  // Download screenshots (for theme detection and background colors)
  let screenshotsDownloaded = 0;
  if (appInfo.screenshots && appInfo.screenshots.length > 0) {
    // Download up to 3 screenshots for theme detection
    for (let i = 0; i < Math.min(3, appInfo.screenshots.length); i++) {
      const screenshotUrl = appInfo.screenshots[i];
      // Clean URL and get proper extension
      const cleanUrl = screenshotUrl.split("?")[0];
      const screenshotExt = path.extname(cleanUrl) || ".jpg";
      const screenshotPath = path.join(
        imagesDir,
        `screenshot${i + 1}${screenshotExt}`
      );
      if (await downloadImage(screenshotUrl, screenshotPath)) {
        downloadedImages.push(`images/screenshot${i + 1}${screenshotExt}`);
        screenshotsDownloaded++;
      }
    }
    if (screenshotsDownloaded > 0) {
      console.log(
        `✅ Downloaded ${screenshotsDownloaded} screenshot(s) for theme detection`
      );
    }
  }

  // Ensure we have at least logo or screenshots
  if (!iconDownloaded && screenshotsDownloaded === 0) {
    console.log(`⚠️ No images downloaded (neither logo nor screenshots)`);
  }

  // Analyze colors from downloaded images using image processing
  let colorPalette = appInfo.colorPalette; // Use existing as fallback

  if (downloadedImages.length > 0) {
    console.log(`🎨 Starting color extraction from images...`);
    const extractedColors = await extractColorsFromScreenshots(generationDir);

    if (extractedColors && extractedColors.primary) {
      console.log(`✅ Color extraction completed`);

      // Merge with existing styles
      colorPalette = {
        ...extractedColors,
        styles: appInfo.colorPalette?.styles || {
          borderRadius: "16px",
          buttonStyle: "rounded-full",
          cardStyle: "glassmorphism",
          spacing: "compact",
          layout: "horizontal",
        },
      };

      // Update appInfo with new color palette
      appInfo.colorPalette = colorPalette;
    } else {
      console.log(
        `⚠️ Color extraction didn't return valid colors, using existing palette`
      );
    }
  }

  // Prepare data.json with updated color palette
  const data = {
    appInfo,
    businessModels,
    timestamp: new Date().toISOString(),
  };
  const dataJsonPath = path.join(generationDir, "data.json");
  fs.writeFileSync(dataJsonPath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`✅ Saved data.json with color palette`);

  // Create prompt
  const prompt = customPrompt || createDefaultPrompt(appInfo, businessModels, pageType);
  const promptPath = path.join(generationDir, "prompt.txt");
  fs.writeFileSync(promptPath, prompt, "utf-8");
  console.log(`✅ Saved prompt.txt`);

  // Create cursor subdirectory (similar to run_cursor.py)
  const cursorDir = path.join(generationDir, `cursor-${model}`);
  fs.mkdirSync(cursorDir, { recursive: true });

  // Modify prompt to reference parent directory and images
  const iconFile = downloadedImages.find((f) => f.toLowerCase().includes("icon"));
  const iconReference = iconFile 
    ? `- ../${iconFile} (app icon - USE THIS, do not generate/create one)`
    : `- App icon URL available in data.json at appInfo.icon (use this URL as <img src> tag)`;

  const modifiedPrompt = prompt
    .replace(
      "You are inside a folder that already contains:",
      "IMPORTANT: All data files and images are in the PARENT directory (one level up).\n" +
        "Use paths like ../data.json, ../images/icon.*\n\n" +
        "The parent directory contains:"
    )
    .replace(
      "- data.json (app information and business models)",
      "- ../data.json (app information and business models)\n" +
      iconReference
    )
    .replace(
      "- ../images/icon.* (app icon/logo - USE THIS, DO NOT GENERATE)",
      iconReference
    );

  // Save modified prompt for reference
  const modifiedPromptPath = path.join(cursorDir, "prompt_used.txt");
  fs.writeFileSync(modifiedPromptPath, modifiedPrompt, "utf-8");
  console.log(`✅ Saved modified prompt to cursor directory`);

  // Change to cursor directory and run cursor-agent
  const originalDir = process.cwd();

  try {
    process.chdir(cursorDir);
    console.log(`📂 Changed directory to: ${cursorDir}`);

    // Build cursor-agent command
    const args = model === "auto" ? [] : ["--model", model];

    console.log(`🚀 Running: cursor-agent ${args.join(" ")}`);
    console.log("=".repeat(60));

    // Run cursor-agent with the prompt
    await runCursorAgent(modifiedPrompt, args);

    console.log("=".repeat(60));
    console.log("✅ Cursor-agent completed");

    // Look for generated files (index.html, styles.css, script.js)
    let generatedHtml = findGeneratedHTML(cursorDir);

    if (generatedHtml) {
      console.log(`✅ Found generated HTML (${generatedHtml.length} chars)`);

      // Replace local image paths with original URLs or base64
      generatedHtml = await fixImagePaths(generatedHtml, generationDir, appInfo);

      // Save the result
      const resultPath = path.join(generationDir, "result.html");
      fs.writeFileSync(resultPath, generatedHtml, "utf-8");
      console.log(`✅ Saved result to: ${resultPath}`);

      return generatedHtml;
    } else {
      throw new Error("No HTML file was generated by cursor-agent");
    }
  } catch (error) {
    console.error(`❌ Error running cursor-agent: ${error.message}`);
    throw error;
  } finally {
    process.chdir(originalDir);
  }
}

/**
 * Create default prompt for page generation
 */
function createDefaultPrompt(appInfo, businessModels, pageType = "paywall") {
  if (pageType === "landing") {
    return createLandingPagePrompt(appInfo);
  } else if (pageType === "about") {
    return createAboutPagePrompt(appInfo);
  } else if (pageType === "features") {
    return createFeaturesPagePrompt(appInfo);
  }
  
  // Default: Paywall prompt
  return `You are a designer and frontend developer creating a mobile app paywall.

You are inside a folder that already contains:
- data.json (app information and business models)
- ../images/icon.* (app icon/logo - USE THIS, DO NOT GENERATE)

Use ONLY local files.
Do not fetch anything from the internet.

Analyze data.json and generate a modern, beautiful, rich paywall HTML page.

RULES:
- Use only facts found in data.json.
- CRITICAL: If data.json contains businessModels, you MUST use the EXACT pricing, tier names, descriptions, and features from businessModels. Do NOT generate or create new pricing tiers.
- If businessModels is present in data.json, copy the pricing tiers EXACTLY as provided - same prices, same names, same descriptions, same features.
- Generate descriptive text that matches the app's category and theme (but NOT for pricing - use exact pricing from businessModels if provided).
- If factual data is missing (except pricing), use reasonable defaults based on the app category.
- DO NOT generate or create an app icon. Use the existing icon from ../images/icon.* if available, or reference appInfo.icon URL from data.json.

DESIGN:
- Take the main color palette from data.json (appInfo.colorPalette).
- Support colors may come from the app theme.
- Reduce colors into a minimal, beautiful palette.
- Mobile-first design - EXACT dimensions: 375px width × 812px height.
- CRITICAL: The body and main container MUST be exactly 375px wide with no overflow.
- Use box-sizing: border-box for all elements.
- Ensure no horizontal scrolling - all content must fit within 375px.
- Clean, modern, responsive design.
- Make it RICH and visually engaging with:
  * Decorative elements (subtle shapes, patterns, or gradients)
  * Visual hierarchy with typography
  * Layered design with depth (shadows, overlays)
  * Smooth micro-interactions

CONTENT:
- CRITICAL: Use the EXACT business models from data.json.businessModels - DO NOT generate or create new pricing tiers.
- You MUST use the exact pricing, names, descriptions, and features provided in data.json.businessModels.
- Display the pricing tiers exactly as specified in businessModels (use the exact prices, currency, period, and names).
- If businessModels is provided in data.json, use ONLY those models - do not modify, add, or remove tiers.
- Display pricing prominently using the exact values from businessModels.
- Display key features for each tier as specified in the businessModels data.
- Use SVG ICONS for feature bullet points (checkmark, star, arrow, shield, etc.) - mix icons with text bullets for visual interest.
- Keep tone natural and engaging.
- Add visual interest with:
  * Icons for feature lists (use inline SVG - checkmark, star, arrow-right, shield, zap, heart, etc.)
  * Subtle badges or tags (e.g., "Most Popular", "Best Value")
  * Trust indicators or social proof elements
  * Visual separators or dividers between sections
  * Decorative accents that complement the design

FEATURE LIST DESIGN:
- Use SVG icons for SOME bullet points (mix icons with regular bullets for variety):
  * Checkmark icons for features
  * Star icons for premium features
  * Arrow or sparkle icons for special highlights
  * Shield icons for security/trust features
- Keep icons simple, clean SVG (not emojis, use actual SVG paths).
- Use icons inline with text for better visual appeal.
- Alternate between icon bullets and regular bullets for rhythm.

TECHNICAL:
- Create a single HTML file with embedded CSS and JavaScript.
- Use vanilla HTML, CSS, JS (no external dependencies).
- Make it production-ready and visually stunning.
- Include smooth animations and transitions.
- Use modern CSS features (gradients, backdrop-filter, box-shadow, transforms, etc.).
- For app icon: Use <img src="../images/icon.*"> to reference the local icon file (the system will automatically fix the path to use the original URL when needed). DO NOT create/generate an icon.

WIDTH CONSTRAINTS (CRITICAL):
- The viewport must be exactly 375px wide, height can be flexible for scrolling.
- Add this to your CSS: 
  * { box-sizing: border-box; }
  html, body { width: 375px; margin: 0; padding: 0; overflow-x: hidden; overflow-y: auto; }
  html { height: 100%; }
  body { max-width: 375px; width: 100%; min-height: 812px; }
- CRITICAL: Use overflow-y: auto (NOT hidden) to allow vertical scrolling.
- CRITICAL: Use overflow-x: hidden to prevent horizontal scrolling.
- All containers should use width: 100% or max-width: 375px.
- Never use fixed widths larger than 375px.
- Use padding instead of margins when possible to avoid overflow.
- Content can be taller than 812px - scrolling is allowed and encouraged.
- Test that content fits within 375px width with no horizontal scroll, but vertical scroll should work.

RICH DESIGN ELEMENTS:
- Add subtle background patterns or gradients
- Use decorative shapes (circles, curves) as accents
- Implement glassmorphism or card-based design
- Add hover effects and interactive states
- Include smooth scroll animations
- Use typography hierarchy (different font sizes, weights)
- Add subtle borders, dividers, or separators
- Include visual feedback on interactions

OUTPUT:
- Create exactly 1 file: index.html
- Include all CSS in <style> tags.
- Include all JavaScript in <script> tags.
- Output code only - complete, valid HTML.
- The HTML should be a complete, standalone paywall page.
- Use the existing app icon from ../images/icon.* OR appInfo.icon from data.json - DO NOT create/generate one.

The paywall should feel premium, rich, visually engaging and match the app's brand identity from data.json.`;
}

/**
 * Create prompt for landing page generation
 */
function createLandingPagePrompt(appInfo) {
  return `You are a designer and frontend developer creating a modern mobile app landing page.

You are inside a folder that already contains:
- data.json (app information)
- ../images/icon.* (app icon/logo - USE THIS, DO NOT GENERATE)

Use ONLY local files.
Do not fetch anything from the internet.

Analyze data.json and generate a modern, beautiful, single-page landing page HTML.

RULES:
- Use only facts found in data.json.
- Generate descriptive, engaging content that matches the app's category and theme.
- Create compelling copy that highlights the app's value proposition.
- DO NOT generate or create an app icon. Use the existing icon from ../images/icon.* if available, or reference appInfo.icon URL from data.json.

DESIGN:
- Take the main color palette from data.json (appInfo.colorPalette).
- Support colors may come from the app theme.
- Mobile-first design - EXACT dimensions: 375px width, flexible height for scrolling.
- CRITICAL: The body and main container MUST be exactly 375px wide with no overflow.
- Use box-sizing: border-box for all elements.
- Ensure no horizontal scrolling - all content must fit within 375px.
- Clean, modern, responsive design.
- Make it RICH and visually engaging with:
  * Hero section with app icon and headline
  * Feature highlights section
  * Benefits/social proof section
  * Call-to-action section
  * Decorative elements and smooth animations

CONTENT SECTIONS:
1. **Hero Section** - Eye-catching header with:
   - App icon/logo (use existing from ../images/icon.*)
   - App name and tagline
   - Main value proposition
   - Primary call-to-action button

2. **Features Section** - Highlight key features:
   - 3-5 main features with icons
   - Brief descriptions
   - Visual icons (SVG, not emojis)

3. **Benefits/Why Choose Section** - Show value:
   - Key benefits or unique selling points
   - Visual elements that support the message

4. **Social Proof/Testimonials** - Build trust:
   - Star ratings or testimonials
   - User count or download numbers (if available)

5. **Final CTA Section** - Strong call-to-action:
   - Download button
   - App Store / Play Store badges

TECHNICAL:
- Create a single HTML file with embedded CSS and JavaScript.
- Use vanilla HTML, CSS, JS (no external dependencies).
- Make it production-ready and visually stunning.
- Include smooth animations and scroll effects.
- Use modern CSS features (gradients, backdrop-filter, box-shadow, transforms, etc.).
- For app icon: Use <img src="../images/icon.*"> to reference the local icon file. If the path doesn't work, the system will automatically replace it with the original URL.
- For screenshots: Use <img src="../images/screenshot1.*">, etc. The system will automatically fix these paths.

WIDTH CONSTRAINTS (CRITICAL):
- The viewport must be exactly 375px wide, height can be flexible for scrolling.
- Add this to your CSS: 
  * { box-sizing: border-box; }
  html, body { width: 375px; margin: 0; padding: 0; overflow-x: hidden; overflow-y: auto; }
  html { height: 100%; }
  body { max-width: 375px; width: 100%; min-height: 812px; }
- CRITICAL: Use overflow-y: auto (NOT hidden) to allow vertical scrolling.
- Content can be taller than 812px - scrolling is allowed and encouraged.

The landing page should feel premium, modern, and compelling, showcasing the app's value and encouraging downloads.`;
}

/**
 * Create prompt for about page generation
 */
function createAboutPagePrompt(appInfo) {
  return `You are a designer and frontend developer creating a modern mobile app about page.

You are inside a folder that already contains:
- data.json (app information)
- ../images/icon.* (app icon/logo - USE THIS, DO NOT GENERATE)

Use ONLY local files.
Do not fetch anything from the internet.

Analyze data.json and generate a modern, beautiful about page HTML that tells the app's story.

RULES:
- Use only facts found in data.json.
- DO NOT generate or create an app icon. Use <img src="../images/icon.*"> to reference the local icon file.

DESIGN:
- Take the main color palette from data.json (appInfo.colorPalette).
- Mobile-first design - EXACT dimensions: 375px width, flexible height for scrolling.
- CRITICAL: The body and main container MUST be exactly 375px wide with no overflow.
- Use box-sizing: border-box for all elements.

CONTENT SECTIONS:
1. **Hero Section** - App introduction with icon (use <img src="../images/icon.*">)
2. **Story/Description** - Detailed app description from data.json
3. **Team/Developer** - Developer information
4. **Mission/Vision** - What the app aims to achieve
5. **Contact/Support** - Ways to reach out

TECHNICAL:
- Create a single HTML file with embedded CSS and JavaScript.
- For app icon: Use <img src="../images/icon.*"> to reference the local icon file.
- Include smooth animations and modern CSS features.
- Use the same width constraints as the landing page (375px width, overflow-y: auto).

The about page should feel premium and match the app's brand identity.`;
}

/**
 * Create prompt for features page generation
 */
function createFeaturesPagePrompt(appInfo) {
  return `You are a designer and frontend developer creating a modern mobile app features page.

You are inside a folder that already contains:
- data.json (app information)
- ../images/icon.* (app icon/logo - USE THIS, DO NOT GENERATE)
- ../images/screenshot*.{jpg,webp,png} (screenshots - USE THESE for visual demonstrations)

Use ONLY local files.
Do not fetch anything from the internet.

Analyze data.json and generate a modern, beautiful features page HTML that showcases all app features.

RULES:
- Use only facts found in data.json.
- DO NOT generate or create an app icon. Use <img src="../images/icon.*"> to reference the local icon file.
- Use screenshots from ../images/screenshot*.{jpg,webp,png} to show features visually.

DESIGN:
- Take the main color palette from data.json (appInfo.colorPalette).
- Mobile-first design - EXACT dimensions: 375px width, flexible height for scrolling.
- CRITICAL: The body and main container MUST be exactly 375px wide with no overflow.
- Use box-sizing: border-box for all elements.

CONTENT SECTIONS:
1. **Hero Section** - Features overview with app icon (use <img src="../images/icon.*">)
2. **Feature Grid** - Detailed feature cards with:
   - Feature icons (SVG)
   - Feature names
   - Feature descriptions
3. **Feature Categories** - Group related features
4. **Visual Demonstrations** - Show features using screenshots (use <img src="../images/screenshot1.*">, etc.)

TECHNICAL:
- Create a single HTML file with embedded CSS and JavaScript.
- For app icon: Use <img src="../images/icon.*"> to reference the local icon file.
- For screenshots: Use <img src="../images/screenshot1.*">, <img src="../images/screenshot2.*">, etc.
- Include smooth animations and modern CSS features.
- Use the same width constraints as the landing page (375px width, overflow-y: auto).

The features page should feel premium and match the app's brand identity.`;
}

/**
 * Run cursor-agent asynchronously
 */
function runCursorAgent(prompt, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn("cursor-agent", args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    // Send prompt to stdin
    child.stdin.write(prompt);
    child.stdin.end();

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      // Forward output to console
      process.stdout.write(text);
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      // Forward error output to console
      process.stderr.write(text);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`cursor-agent exited with code ${code}\n${stderr}`));
      }
    });

    child.on("error", (error) => {
      reject(new Error(`Failed to start cursor-agent: ${error.message}`));
    });
  });
}

/**
 * Find generated HTML file in directory
 */
function findGeneratedHTML(dir) {
  // Check for index.html first
  const indexHtml = path.join(dir, "index.html");
  if (fs.existsSync(indexHtml)) {
    return fs.readFileSync(indexHtml, "utf-8");
  }

  // Look for any HTML file
  const files = fs.readdirSync(dir);
  const htmlFile = files.find((f) => f.endsWith(".html"));
  if (htmlFile) {
    return fs.readFileSync(path.join(dir, htmlFile), "utf-8");
  }

  return null;
}

module.exports = { 
  generatePaywallWithCursor,
  runCursorAgent,
  findGeneratedHTML
};
