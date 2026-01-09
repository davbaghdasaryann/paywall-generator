// backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");
const axios = require("axios");
const multer = require("multer");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const app = express();
app.use(cors());
app.use(express.json());

// Configure multer for file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "text/html" ||
      file.originalname.endsWith(".html") ||
      file.originalname.endsWith(".htm")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only HTML files are allowed"), false);
    }
  },
});

// In-memory storage for analyzed paywall patterns
let paywallPatterns = {
  colors: [],
  fonts: [],
  fontSizes: [],
  fontWeights: [],
  lineHeights: [],
  letterSpacing: [],
  spacing: [],
  borderRadius: [],
  shadows: [],
  borders: [],
  transitions: [],
  transforms: [],
  opacities: [],
  gradients: [],
  zIndex: [],
  gaps: [],
  widths: [],
  heights: [],
  displayTypes: [],
  flexProperties: [],
  gridProperties: [],
  positions: [],
  textTransforms: [],
  textDecorations: [],
  breakpoints: [],
  animations: [],
  layouts: [],
  commonStyles: {},
  componentStyles: {},
  count: 0,
};

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Extract Figma file key from URL
function extractFigmaFileKey(url) {
  const match = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

// Extract node ID from URL (optional - for specific frames)
function extractNodeId(url) {
  const match = url.match(/node-id=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// Fetch Figma file data
async function fetchFigmaFile(fileKey) {
  try {
    const response = await axios.get(
      `https://api.figma.com/v1/files/${fileKey}`,
      {
        headers: {
          "X-Figma-Token": process.env.FIGMA_ACCESS_TOKEN,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Figma API error:", error.response?.data || error.message);
    throw new Error("Failed to fetch Figma file");
  }
}

// Helper function to extract dimensions from a Figma node
function extractNodeDimensions(node) {
  if (!node) return { width: 0, height: 0 };

  let width = 0;
  let height = 0;

  // Try absoluteBoundingBox first (most reliable in Figma API)
  if (node.absoluteBoundingBox) {
    width = Math.round(node.absoluteBoundingBox.width || 0);
    height = Math.round(node.absoluteBoundingBox.height || 0);
  }

  // Fallback to direct width/height properties
  if (width === 0 && node.width) {
    width = Math.round(node.width);
  }
  if (height === 0 && node.height) {
    height = Math.round(node.height);
  }

  return { width, height };
}

// Helper function to extract dimensions from a Figma node
function extractNodeDimensions(node) {
  if (!node) return { width: 0, height: 0 };

  let width = 0;
  let height = 0;

  // Try absoluteBoundingBox first (most reliable in Figma API)
  if (node.absoluteBoundingBox) {
    width = Math.round(node.absoluteBoundingBox.width || 0);
    height = Math.round(node.absoluteBoundingBox.height || 0);
  }

  // Fallback to direct width/height properties
  if (width === 0 && node.width) {
    width = Math.round(node.width);
  }
  if (height === 0 && node.height) {
    height = Math.round(node.height);
  }

  return { width, height };
}

// Resolve node ID from path-based ID using Figma's nodes endpoint
async function resolveNodeId(fileKey, pathBasedId) {
  try {
    const response = await axios.get(
      `https://api.figma.com/v1/files/${fileKey}/nodes`,
      {
        params: {
          ids: pathBasedId,
        },
        headers: {
          "X-Figma-Token": process.env.FIGMA_ACCESS_TOKEN,
        },
      }
    );

    console.log(
      "Node resolution response:",
      JSON.stringify(response.data, null, 2)
    );

    if (response.data.nodes && response.data.nodes[pathBasedId]) {
      const node = response.data.nodes[pathBasedId];
      // The document.id is the actual node ID we need
      if (node.document && node.document.id) {
        return node.document.id;
      }
    }

    // If resolution doesn't work, try using the path-based ID directly
    // Figma's images API sometimes accepts path-based IDs
    return pathBasedId;
  } catch (error) {
    console.error("Node resolution error:", error.message);
    if (error.response) {
      console.error(
        "API response:",
        JSON.stringify(error.response.data, null, 2)
      );
    }
    // If resolution fails, return the original ID (it might work directly)
    return pathBasedId;
  }
}

// Get image export from Figma
async function getFigmaImage(fileKey, nodeId) {
  try {
    const response = await axios.get(
      `https://api.figma.com/v1/images/${fileKey}`,
      {
        params: {
          ids: nodeId,
          format: "png",
          scale: 1,
        },
        headers: {
          "X-Figma-Token": process.env.FIGMA_ACCESS_TOKEN,
        },
      }
    );

    // Log the response for debugging
    console.log(
      "Figma images API response:",
      JSON.stringify(response.data, null, 2)
    );

    if (
      !response.data.images ||
      Object.keys(response.data.images).length === 0
    ) {
      console.error(
        "No images in response. Full response:",
        JSON.stringify(response.data, null, 2)
      );
      throw new Error(
        `No image URL returned. Response: ${JSON.stringify(response.data)}`
      );
    }

    // The response might have the node ID in a different format, try to get the first image
    const imageUrl =
      response.data.images[nodeId] || Object.values(response.data.images)[0];

    if (!imageUrl) {
      throw new Error(
        `No image URL returned for node ${nodeId}. Available: ${Object.keys(
          response.data.images || {}
        ).join(", ")}`
      );
    }

    // Download the image
    const imageResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer",
    });

    return Buffer.from(imageResponse.data).toString("base64");
  } catch (error) {
    console.error("Image fetch error:", error.message);
    if (error.response) {
      console.error("API response status:", error.response.status);
      console.error(
        "API response data:",
        JSON.stringify(error.response.data, null, 2)
      );
    }
    throw new Error(`Failed to fetch Figma image: ${error.message}`);
  }
}

// Find a node by ID in the Figma file structure
function findNodeById(node, targetId) {
  if (!node) return null;

  // Check if this node matches (handle both direct ID and path-based matching)
  if (node.id === targetId) {
    return node;
  }

  // Also check if the targetId is a path (like "1-3628") and matches the node's path
  // Figma sometimes uses path-based IDs in URLs
  if (node.id && targetId.includes("-")) {
    // Try to match by checking if the node ID contains parts of the path
    const pathParts = targetId.split("-");
    if (pathParts.length >= 2) {
      // This is a simplified check - in practice, Figma's path system is more complex
      // But we'll try to find nodes that might match
    }
  }

  // Recursively search children
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeById(child, targetId);
      if (found) return found;
    }
  }

  return null;
}

// Find the top-level frame/canvas in Figma file
function findTopLevelNode(figmaData) {
  const document = figmaData.document;

  // Look for the first canvas/page
  if (document.children && document.children.length > 0) {
    const firstPage = document.children[0];

    // Look for frames in the page
    if (firstPage.children && firstPage.children.length > 0) {
      // Return the first frame that looks like a paywall
      // (you can add more sophisticated detection here)
      const frame = firstPage.children.find(
        (child) => child.type === "FRAME" || child.type === "COMPONENT"
      );

      return frame || firstPage.children[0];
    }
  }

  return null;
}

// Extract design patterns from HTML/CSS paywall files
function extractPaywallPatterns(htmlContent) {
  const $ = cheerio.load(htmlContent);
  const patterns = {
    colors: new Set(),
    fonts: new Set(),
    fontSizes: new Set(),
    fontWeights: new Set(),
    lineHeights: new Set(),
    letterSpacing: new Set(),
    spacing: new Set(),
    borderRadius: new Set(),
    shadows: new Set(),
    borders: new Set(),
    transitions: new Set(),
    transforms: new Set(),
    opacities: new Set(),
    gradients: new Set(),
    zIndex: new Set(),
    gaps: new Set(),
    widths: new Set(),
    heights: new Set(),
    displayTypes: new Set(),
    flexProperties: new Set(),
    gridProperties: new Set(),
    positions: new Set(),
    textTransforms: new Set(),
    textDecorations: new Set(),
    breakpoints: new Set(),
    animations: new Set(),
    commonStyles: {},
    componentStyles: {},
  };

  // Extract CSS from <style> tags
  $("style").each((i, elem) => {
    const cssText = $(elem).html() || "";
    extractPatternsFromCSS(cssText, patterns);
  });

  // Extract inline styles
  $("[style]").each((i, elem) => {
    const inlineStyle = $(elem).attr("style") || "";
    extractPatternsFromCSS(inlineStyle, patterns);
  });

  // Extract component-specific styles
  extractComponentStyles($, patterns);

  // Extract common layout patterns
  const buttonCount = $("button, .button, [class*='btn']").length;
  const cardCount = $(".card, [class*='card']").length;
  const containerCount = $(".container, [class*='container']").length;
  const inputCount = $("input, .input, [class*='input']").length;
  const modalCount = $(".modal, [class*='modal'], [class*='dialog']").length;

  patterns.layouts = {
    buttons: buttonCount,
    cards: cardCount,
    containers: containerCount,
    inputs: inputCount,
    modals: modalCount,
  };

  // Convert Sets to Arrays and get most common values
  return {
    colors: Array.from(patterns.colors).slice(0, 30),
    fonts: Array.from(patterns.fonts).slice(0, 15),
    fontSizes: Array.from(patterns.fontSizes)
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0)
      .sort((a, b) => a - b)
      .slice(0, 20),
    fontWeights: Array.from(patterns.fontWeights)
      .map(Number)
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b)
      .slice(0, 10),
    lineHeights: Array.from(patterns.lineHeights)
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0)
      .sort((a, b) => a - b)
      .slice(0, 15),
    letterSpacing: Array.from(patterns.letterSpacing)
      .map(Number)
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b)
      .slice(0, 10),
    spacing: Array.from(patterns.spacing)
      .map(Number)
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b)
      .slice(0, 25),
    borderRadius: Array.from(patterns.borderRadius)
      .map(Number)
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b)
      .slice(0, 15),
    shadows: Array.from(patterns.shadows).slice(0, 15),
    borders: Array.from(patterns.borders).slice(0, 15),
    transitions: Array.from(patterns.transitions).slice(0, 15),
    transforms: Array.from(patterns.transforms).slice(0, 10),
    opacities: Array.from(patterns.opacities)
      .map(Number)
      .filter((n) => !isNaN(n) && n >= 0 && n <= 1)
      .sort((a, b) => a - b)
      .slice(0, 10),
    gradients: Array.from(patterns.gradients).slice(0, 10),
    zIndex: Array.from(patterns.zIndex)
      .map(Number)
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b)
      .slice(0, 10),
    gaps: Array.from(patterns.gaps)
      .map(Number)
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b)
      .slice(0, 15),
    widths: Array.from(patterns.widths)
      .map(Number)
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b)
      .slice(0, 15),
    heights: Array.from(patterns.heights)
      .map(Number)
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b)
      .slice(0, 15),
    displayTypes: Array.from(patterns.displayTypes).slice(0, 10),
    flexProperties: Array.from(patterns.flexProperties).slice(0, 15),
    gridProperties: Array.from(patterns.gridProperties).slice(0, 10),
    positions: Array.from(patterns.positions).slice(0, 5),
    textTransforms: Array.from(patterns.textTransforms).slice(0, 5),
    textDecorations: Array.from(patterns.textDecorations).slice(0, 5),
    breakpoints: Array.from(patterns.breakpoints)
      .map(Number)
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b)
      .slice(0, 10),
    animations: Array.from(patterns.animations).slice(0, 10),
    layouts: patterns.layouts,
    commonStyles: patterns.commonStyles,
    componentStyles: patterns.componentStyles,
  };
}

// Helper function to extract patterns from CSS text
function extractPatternsFromCSS(cssText, patterns) {
  // Extract colors (hex, rgb, rgba, hsl, named colors)
  const colorRegex =
    /(#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)|hsl\([^)]+\)|hsla\([^)]+\)|transparent|currentColor)/g;
  const colors = cssText.match(colorRegex);
  if (colors) {
    colors.forEach((color) => patterns.colors.add(color.trim()));
  }

  // Extract font families
  const fontRegex = /font-family:\s*([^;]+)/gi;
  const fontMatches = cssText.matchAll(fontRegex);
  for (const match of fontMatches) {
    const fonts = match[1].split(",").map((f) => f.trim().replace(/['"]/g, ""));
    fonts.forEach((font) => patterns.fonts.add(font));
  }

  // Extract font sizes
  const fontSizeRegex = /font-size:\s*(\d+(?:\.\d+)?)(?:px|rem|em)?/gi;
  const fontSizeMatches = cssText.matchAll(fontSizeRegex);
  for (const match of fontSizeMatches) {
    patterns.fontSizes.add(match[1]);
  }

  // Extract font weights
  const fontWeightRegex = /font-weight:\s*(\d+|normal|bold|bolder|lighter)/gi;
  const fontWeightMatches = cssText.matchAll(fontWeightRegex);
  for (const match of fontWeightMatches) {
    const weight = match[1];
    if (weight === "normal") patterns.fontWeights.add("400");
    else if (weight === "bold") patterns.fontWeights.add("700");
    else if (!isNaN(weight)) patterns.fontWeights.add(weight);
  }

  // Extract line heights
  const lineHeightRegex = /line-height:\s*(\d+(?:\.\d+)?)(?:px|rem|em|%)?/gi;
  const lineHeightMatches = cssText.matchAll(lineHeightRegex);
  for (const match of lineHeightMatches) {
    patterns.lineHeights.add(match[1]);
  }

  // Extract letter spacing
  const letterSpacingRegex = /letter-spacing:\s*(-?\d+(?:\.\d+)?)(?:px|em)?/gi;
  const letterSpacingMatches = cssText.matchAll(letterSpacingRegex);
  for (const match of letterSpacingMatches) {
    patterns.letterSpacing.add(match[1]);
  }

  // Extract spacing values (padding, margin)
  const spacingRegex =
    /(?:padding|margin)(?:-top|-right|-bottom|-left)?:\s*(\d+(?:\.\d+)?)(?:px|rem|em|%)?/gi;
  const spacingMatches = cssText.matchAll(spacingRegex);
  for (const match of spacingMatches) {
    patterns.spacing.add(match[1]);
  }

  // Extract border radius
  const borderRadiusRegex =
    /border-radius:\s*(\d+(?:\.\d+)?)(?:px|rem|em|%)?/gi;
  const borderRadiusMatches = cssText.matchAll(borderRadiusRegex);
  for (const match of borderRadiusMatches) {
    patterns.borderRadius.add(match[1]);
  }

  // Extract box shadows
  const shadowRegex = /box-shadow:\s*([^;]+)/gi;
  const shadowMatches = cssText.matchAll(shadowRegex);
  for (const match of shadowMatches) {
    patterns.shadows.add(match[1].trim());
  }

  // Extract borders (width, style, color)
  const borderRegex =
    /border(?:-top|-right|-bottom|-left)?(?:-width)?:\s*(\d+(?:\.\d+)?(?:px|rem|em)?)\s+(\w+)\s+([^;]+)/gi;
  const borderMatches = cssText.matchAll(borderRegex);
  for (const match of borderMatches) {
    patterns.borders.add(`${match[1]}px ${match[2]} ${match[3].trim()}`);
  }

  // Extract transitions
  const transitionRegex = /transition:\s*([^;]+)/gi;
  const transitionMatches = cssText.matchAll(transitionRegex);
  for (const match of transitionMatches) {
    patterns.transitions.add(match[1].trim());
  }

  // Extract transforms
  const transformRegex = /transform:\s*([^;]+)/gi;
  const transformMatches = cssText.matchAll(transformRegex);
  for (const match of transformMatches) {
    patterns.transforms.add(match[1].trim());
  }

  // Extract opacity
  const opacityRegex = /opacity:\s*(\d+(?:\.\d+)?)/gi;
  const opacityMatches = cssText.matchAll(opacityRegex);
  for (const match of opacityMatches) {
    patterns.opacities.add(match[1]);
  }

  // Extract gradients
  const gradientRegex =
    /(?:background|background-image):\s*(linear-gradient|radial-gradient|conic-gradient)\([^)]+\)/gi;
  const gradientMatches = cssText.matchAll(gradientRegex);
  for (const match of gradientMatches) {
    patterns.gradients.add(match[0].trim());
  }

  // Extract z-index
  const zIndexRegex = /z-index:\s*(-?\d+)/gi;
  const zIndexMatches = cssText.matchAll(zIndexRegex);
  for (const match of zIndexMatches) {
    patterns.zIndex.add(match[1]);
  }

  // Extract gap (flexbox/grid)
  const gapRegex = /gap:\s*(\d+(?:\.\d+)?)(?:px|rem|em)?/gi;
  const gapMatches = cssText.matchAll(gapRegex);
  for (const match of gapMatches) {
    patterns.gaps.add(match[1]);
  }

  // Extract widths
  const widthRegex = /width:\s*(\d+(?:\.\d+)?)(?:px|rem|em|%)?/gi;
  const widthMatches = cssText.matchAll(widthRegex);
  for (const match of widthMatches) {
    if (!match[1].includes("%") && !match[1].includes("vw")) {
      patterns.widths.add(match[1]);
    }
  }

  // Extract heights
  const heightRegex = /height:\s*(\d+(?:\.\d+)?)(?:px|rem|em|%)?/gi;
  const heightMatches = cssText.matchAll(heightRegex);
  for (const match of heightMatches) {
    if (!match[1].includes("%") && !match[1].includes("vh")) {
      patterns.heights.add(match[1]);
    }
  }

  // Extract display types
  const displayRegex = /display:\s*(\w+)/gi;
  const displayMatches = cssText.matchAll(displayRegex);
  for (const match of displayMatches) {
    patterns.displayTypes.add(match[1]);
  }

  // Extract flex properties
  const flexRegex =
    /(?:flex-direction|justify-content|align-items|align-self|flex-wrap|flex-grow|flex-shrink):\s*([^;]+)/gi;
  const flexMatches = cssText.matchAll(flexRegex);
  for (const match of flexMatches) {
    patterns.flexProperties.add(match[0].trim());
  }

  // Extract grid properties
  const gridRegex =
    /(?:grid-template-columns|grid-template-rows|grid-column|grid-row|grid-area):\s*([^;]+)/gi;
  const gridMatches = cssText.matchAll(gridRegex);
  for (const match of gridMatches) {
    patterns.gridProperties.add(match[0].trim());
  }

  // Extract position
  const positionRegex = /position:\s*(\w+)/gi;
  const positionMatches = cssText.matchAll(positionRegex);
  for (const match of positionMatches) {
    patterns.positions.add(match[1]);
  }

  // Extract text transform
  const textTransformRegex = /text-transform:\s*(\w+)/gi;
  const textTransformMatches = cssText.matchAll(textTransformRegex);
  for (const match of textTransformMatches) {
    patterns.textTransforms.add(match[1]);
  }

  // Extract text decoration
  const textDecorationRegex = /text-decoration:\s*([^;]+)/gi;
  const textDecorationMatches = cssText.matchAll(textDecorationRegex);
  for (const match of textDecorationMatches) {
    patterns.textDecorations.add(match[1].trim());
  }

  // Extract media query breakpoints
  const mediaQueryRegex =
    /@media\s+(?:\([^)]+\)|screen|print).*?(?:min-width|max-width):\s*(\d+)(?:px|em|rem)/gi;
  const mediaMatches = cssText.matchAll(mediaQueryRegex);
  for (const match of mediaMatches) {
    patterns.breakpoints.add(match[1]);
  }

  // Extract animations
  const animationRegex = /(?:animation|@keyframes)\s+(\w+)/gi;
  const animationMatches = cssText.matchAll(animationRegex);
  for (const match of animationMatches) {
    patterns.animations.add(match[1]);
  }

  // Extract CSS custom properties (variables)
  const cssVarRegex = /--[\w-]+:\s*([^;]+)/gi;
  const cssVarMatches = cssText.matchAll(cssVarRegex);
  for (const match of cssVarMatches) {
    const varName = match[0].split(":")[0].trim();
    const varValue = match[1].trim();
    if (!patterns.commonStyles.cssVariables) {
      patterns.commonStyles.cssVariables = {};
    }
    patterns.commonStyles.cssVariables[varName] = varValue;
  }
}

// Extract component-specific styles
function extractComponentStyles($, patterns) {
  // Extract button styles
  const buttonStyles = extractSelectorStyles(
    $,
    "button, .button, [class*='btn']",
    [
      "background",
      "color",
      "padding",
      "border-radius",
      "font-weight",
      "font-size",
      "border",
      "box-shadow",
      "transition",
    ]
  );
  if (Object.keys(buttonStyles).length > 0) {
    patterns.componentStyles.buttons = buttonStyles;
  }

  // Extract card styles
  const cardStyles = extractSelectorStyles($, ".card, [class*='card']", [
    "background",
    "border-radius",
    "box-shadow",
    "padding",
    "border",
  ]);
  if (Object.keys(cardStyles).length > 0) {
    patterns.componentStyles.cards = cardStyles;
  }

  // Extract input styles
  const inputStyles = extractSelectorStyles(
    $,
    "input, .input, [class*='input']",
    ["border", "border-radius", "padding", "font-size", "background"]
  );
  if (Object.keys(inputStyles).length > 0) {
    patterns.componentStyles.inputs = inputStyles;
  }
}

// Helper to extract styles for specific selectors
function extractSelectorStyles($, selector, properties) {
  const styles = {};
  const cssText = $("style").html() || "";

  // Try to find styles for the selector
  const selectorRegex = new RegExp(
    `(${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})[^{]*\\{([^}]+)\\}`,
    "gi"
  );
  const matches = cssText.matchAll(selectorRegex);

  for (const match of matches) {
    const styleBlock = match[2];
    properties.forEach((prop) => {
      const propRegex = new RegExp(`${prop}:\\s*([^;]+)`, "gi");
      const propMatch = propRegex.exec(styleBlock);
      if (propMatch) {
        if (!styles[prop]) styles[prop] = new Set();
        styles[prop].add(propMatch[1].trim());
      }
    });
  }

  // Convert Sets to Arrays
  const result = {};
  Object.keys(styles).forEach((key) => {
    result[key] = Array.from(styles[key]).slice(0, 5);
  });
  return result;
}

// Refine paywall code by breaking it into sections and regenerating each section
async function refinePaywallCode(
  initialCode,
  figmaNode,
  designTokens,
  fileKey,
  imagePlaceholderMap,
  patternGuidance
) {
  // Identify major sections in the Figma design
  const sections = identifySections(figmaNode);

  if (sections.length === 0) {
    console.log("No sections identified, skipping refinement");
    return initialCode;
  }

  console.log(`Identified ${sections.length} sections for refinement`);

  const refinedSections = {};
  const sectionPromises = [];

  // Refine each section (limit to 5 sections to avoid too many API calls)
  const sectionsToRefine = sections.slice(0, 5);

  for (const section of sectionsToRefine) {
    const sectionPromise = refineSection(
      section,
      initialCode,
      designTokens,
      fileKey,
      imagePlaceholderMap,
      patternGuidance
    )
      .then((refined) => {
        if (refined) {
          refinedSections[section.name] = refined;
        }
        return refined;
      })
      .catch((error) => {
        console.warn(
          `Failed to refine section ${section.name}:`,
          error.message
        );
        return null;
      });

    sectionPromises.push(sectionPromise);
  }

  await Promise.all(sectionPromises);

  // Only combine if we have refined sections
  if (Object.keys(refinedSections).length > 0) {
    return combineRefinedSections(initialCode, refinedSections);
  }

  return initialCode;
}

// Identify major sections/components in the Figma design
function identifySections(node, depth = 0, sections = []) {
  if (!node || depth > 6) return sections;

  const nodeName = (node.name || "").toLowerCase();

  // Identify common paywall sections
  const isSection =
    node.type === "FRAME" || node.type === "COMPONENT" || node.type === "GROUP";

  if (isSection && depth >= 1) {
    // Check if this looks like a major section
    const isMajorSection =
      nodeName.includes("header") ||
      nodeName.includes("hero") ||
      nodeName.includes("pricing") ||
      nodeName.includes("plan") ||
      nodeName.includes("card") ||
      nodeName.includes("button") ||
      nodeName.includes("footer") ||
      nodeName.includes("feature") ||
      nodeName.includes("cta") ||
      (node.children && node.children.length > 3);

    if (isMajorSection) {
      sections.push({
        name: node.name || `section-${sections.length}`,
        id: node.id,
        type: node.type,
        x: node.x || 0,
        y: node.y || 0,
        width: node.width || 0,
        height: node.height || 0,
        depth: depth,
      });
    }
  }

  // Recursively check children
  if (node.children && depth < 5) {
    for (const child of node.children) {
      identifySections(child, depth + 1, sections);
    }
  }

  return sections;
}

// Refine a specific section
async function refineSection(
  section,
  initialCode,
  designTokens,
  fileKey,
  imagePlaceholderMap,
  patternGuidance
) {
  // Get section-specific design tokens by finding the node
  // Note: We need to pass the full figma data structure, not just tokens
  // For now, we'll use the main design tokens and focus on the section

  // Get section image
  let sectionImage = null;
  try {
    sectionImage = await getFigmaImage(fileKey, section.id);
  } catch (error) {
    console.warn(
      `Could not get image for section ${section.name}:`,
      error.message
    );
  }

  // Create refinement prompt
  const refinementPrompt = `Refine this section to be 1:1 pixel-perfect with Figma.

SECTION: ${section.name}
POSITION: x=${section.x}px, y=${section.y}px
SIZE: ${section.width}px × ${section.height}px

CURRENT CODE (improve this):
HTML:
${extractSectionFromHTML(initialCode.html, section.name)}

CSS:
${extractSectionFromCSS(initialCode.css, section.name)}

CRITICAL REQUIREMENTS - 1:1 MATCHING:
1. Use position: absolute with EXACT coordinates from designTokens.nodes
2. Every element: left: [exact x], top: [exact y], width: [exact w], height: [exact h]
3. Use EXACT colors from tokens (bg property)
4. Use EXACT fonts from tokens (font: f=family, s=size, w=weight, lh=lineHeight)
5. Use EXACT border radius (br property)
6. Use EXACT spacing (margins, padding from tokens)
7. NO approximations - EXACT values only

POSITIONING:
- Section container: position: absolute; left: ${section.x}px; top: ${
    section.y
  }px; width: ${section.width}px; height: ${section.height}px;
- All children: position: absolute with coordinates relative to section (subtract section.x and section.y from global coordinates)

${patternGuidance}

OUTPUT:
Return ONLY JSON (no markdown):
{
  "html": "<!-- section HTML with proper structure -->",
  "css": "/* section CSS with absolute positioning, exact values */"
}`;

  const content = [];

  if (sectionImage) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: sectionImage,
      },
    });
    content.push({
      type: "text",
      text: `[Section Image: ${section.name}]`,
    });
  }

  content.push({
    type: "text",
    text: refinementPrompt,
  });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: content,
      },
    ],
  });

  const textContent = response.content.find((block) => block.type === "text");
  if (!textContent) {
    throw new Error("No text response from Claude");
  }

  let refinedSection;
  try {
    let jsonText = textContent.text.trim();
    jsonText = jsonText.replace(/^```json\s*/i, "");
    jsonText = jsonText.replace(/^```\s*/g, "");
    jsonText = jsonText.replace(/\s*```\s*$/g, "");
    jsonText = jsonText.trim();

    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    refinedSection = JSON.parse(jsonText);

    // Replace image placeholders
    if (Object.keys(imagePlaceholderMap).length > 0) {
      Object.entries(imagePlaceholderMap).forEach(([placeholder, dataUrl]) => {
        if (refinedSection.html) {
          refinedSection.html = refinedSection.html.replace(
            new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"),
            dataUrl
          );
        }
        if (refinedSection.css) {
          refinedSection.css = refinedSection.css.replace(
            new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"),
            dataUrl
          );
        }
      });
    }
  } catch (error) {
    console.error(
      `Failed to parse refined section ${section.name}:`,
      error.message
    );
    return null;
  }

  return refinedSection;
}

// Extract section-specific HTML (simplified - looks for section by class/ID)
function extractSectionFromHTML(html, sectionName) {
  const sectionNameLower = sectionName.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Try to find section in HTML by looking for common patterns
  const patterns = [
    new RegExp(
      `(<[^>]*(?:class|id)=[^>]*${sectionNameLower}[^>]*>[\\s\\S]{0,1000}?</[^>]+>)`,
      "i"
    ),
    new RegExp(`(<section[^>]*>[\\s\\S]{0,500}?</section>)`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return match[1].substring(0, 800);
    }
  }

  return "Section HTML not found - use the section name to identify the correct HTML structure";
}

// Extract section-specific CSS
function extractSectionFromCSS(css, sectionName) {
  const sectionNameLower = sectionName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const regex = new RegExp(`([^{]*${sectionNameLower}[^{]*\\{[^}]+\\})`, "gi");
  const matches = css.match(regex);
  return matches
    ? matches.slice(0, 10).join("\n\n")
    : "Section styles not found - create CSS matching the section structure";
}

// Combine refined sections back into complete code
function combineRefinedSections(initialCode, refinedSections) {
  let refinedHTML = initialCode.html;
  let refinedCSS = initialCode.css;

  // Replace sections in HTML and CSS with refined versions
  Object.entries(refinedSections).forEach(([sectionName, refined]) => {
    if (!refined || !refined.html || !refined.css) return;

    const sectionNameLower = sectionName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    // Try to replace section in HTML
    const htmlRegex = new RegExp(
      `(<[^>]*(?:class|id)=[^>]*${sectionNameLower}[^>]*>[\\s\\S]*?</[^>]+>)`,
      "is"
    );
    if (htmlRegex.test(refinedHTML)) {
      refinedHTML = refinedHTML.replace(htmlRegex, refined.html);
      console.log(`Replaced HTML for section: ${sectionName}`);
    }

    // Add/update section CSS
    const cssRegex = new RegExp(
      `([^{]*${sectionNameLower}[^{]*\\{[^}]+\\})`,
      "gi"
    );
    if (cssRegex.test(refinedCSS)) {
      refinedCSS = refinedCSS.replace(cssRegex, refined.css);
      console.log(`Replaced CSS for section: ${sectionName}`);
    } else {
      // Append new CSS if section styles weren't found
      refinedCSS +=
        "\n\n/* Refined styles for " + sectionName + " */\n" + refined.css;
      console.log(`Added new CSS for section: ${sectionName}`);
    }
  });

  return {
    html: refinedHTML,
    css: refinedCSS,
    js: initialCode.js, // JavaScript stays the same
  };
}

// Merge new patterns with existing patterns
function mergePaywallPatterns(newPatterns) {
  paywallPatterns.count += 1;

  // Helper function to merge arrays (keep unique values, limit size)
  const mergeArray = (target, source, limit, tolerance = null) => {
    if (!Array.isArray(target)) target = [];
    if (!Array.isArray(source)) return target;

    source.forEach((item) => {
      if (tolerance && typeof item === "number") {
        const existing = target.find((t) => Math.abs(t - item) < tolerance);
        if (!existing) {
          target.push(item);
        }
      } else {
        if (!target.includes(item)) {
          target.push(item);
        }
      }
    });

    if (typeof target[0] === "number") {
      return target.sort((a, b) => a - b).slice(0, limit);
    }
    return target.slice(0, limit);
  };

  // Merge all pattern arrays
  paywallPatterns.colors = mergeArray(
    paywallPatterns.colors,
    newPatterns.colors,
    40
  );
  paywallPatterns.fonts = mergeArray(
    paywallPatterns.fonts,
    newPatterns.fonts,
    20
  );
  paywallPatterns.fontSizes = mergeArray(
    paywallPatterns.fontSizes,
    newPatterns.fontSizes,
    25,
    1
  );
  paywallPatterns.fontWeights = mergeArray(
    paywallPatterns.fontWeights,
    newPatterns.fontWeights,
    12,
    50
  );
  paywallPatterns.lineHeights = mergeArray(
    paywallPatterns.lineHeights,
    newPatterns.lineHeights,
    20,
    0.5
  );
  paywallPatterns.letterSpacing = mergeArray(
    paywallPatterns.letterSpacing,
    newPatterns.letterSpacing,
    12,
    0.1
  );
  paywallPatterns.spacing = mergeArray(
    paywallPatterns.spacing,
    newPatterns.spacing,
    30,
    2
  );
  paywallPatterns.borderRadius = mergeArray(
    paywallPatterns.borderRadius,
    newPatterns.borderRadius,
    20,
    2
  );
  paywallPatterns.shadows = mergeArray(
    paywallPatterns.shadows,
    newPatterns.shadows,
    20
  );
  paywallPatterns.borders = mergeArray(
    paywallPatterns.borders,
    newPatterns.borders,
    20
  );
  paywallPatterns.transitions = mergeArray(
    paywallPatterns.transitions,
    newPatterns.transitions,
    20
  );
  paywallPatterns.transforms = mergeArray(
    paywallPatterns.transforms,
    newPatterns.transforms,
    15
  );
  paywallPatterns.opacities = mergeArray(
    paywallPatterns.opacities,
    newPatterns.opacities,
    12,
    0.05
  );
  paywallPatterns.gradients = mergeArray(
    paywallPatterns.gradients,
    newPatterns.gradients,
    15
  );
  paywallPatterns.zIndex = mergeArray(
    paywallPatterns.zIndex,
    newPatterns.zIndex,
    15,
    10
  );
  paywallPatterns.gaps = mergeArray(
    paywallPatterns.gaps,
    newPatterns.gaps,
    20,
    2
  );
  paywallPatterns.widths = mergeArray(
    paywallPatterns.widths,
    newPatterns.widths,
    20,
    10
  );
  paywallPatterns.heights = mergeArray(
    paywallPatterns.heights,
    newPatterns.heights,
    20,
    10
  );
  paywallPatterns.displayTypes = mergeArray(
    paywallPatterns.displayTypes,
    newPatterns.displayTypes,
    12
  );
  paywallPatterns.flexProperties = mergeArray(
    paywallPatterns.flexProperties,
    newPatterns.flexProperties,
    20
  );
  paywallPatterns.gridProperties = mergeArray(
    paywallPatterns.gridProperties,
    newPatterns.gridProperties,
    15
  );
  paywallPatterns.positions = mergeArray(
    paywallPatterns.positions,
    newPatterns.positions,
    8
  );
  paywallPatterns.textTransforms = mergeArray(
    paywallPatterns.textTransforms,
    newPatterns.textTransforms,
    6
  );
  paywallPatterns.textDecorations = mergeArray(
    paywallPatterns.textDecorations,
    newPatterns.textDecorations,
    8
  );
  paywallPatterns.breakpoints = mergeArray(
    paywallPatterns.breakpoints,
    newPatterns.breakpoints,
    15,
    20
  );
  paywallPatterns.animations = mergeArray(
    paywallPatterns.animations,
    newPatterns.animations,
    15
  );

  // Merge layouts
  if (!Array.isArray(paywallPatterns.layouts)) {
    paywallPatterns.layouts = [];
  }
  paywallPatterns.layouts.push(newPatterns.layouts);
  if (paywallPatterns.layouts.length > 50) {
    paywallPatterns.layouts = paywallPatterns.layouts.slice(-50);
  }

  // Merge common styles (merge objects)
  if (newPatterns.commonStyles) {
    Object.assign(paywallPatterns.commonStyles, newPatterns.commonStyles);
  }

  // Merge component styles (merge nested objects)
  if (newPatterns.componentStyles) {
    if (!paywallPatterns.componentStyles) {
      paywallPatterns.componentStyles = {};
    }
    Object.keys(newPatterns.componentStyles).forEach((component) => {
      if (!paywallPatterns.componentStyles[component]) {
        paywallPatterns.componentStyles[component] = {};
      }
      Object.assign(
        paywallPatterns.componentStyles[component],
        newPatterns.componentStyles[component]
      );
    });
  }
}

// Extract detailed design tokens and node information from Figma data
function extractDesignTokens(node) {
  const tokens = {
    colors: [],
    fonts: [],
    spacing: [],
    borderRadius: [],
    nodes: [], // Store node information for pixel-perfect matching (limited to important nodes)
  };

  let nodeCount = 0;
  const MAX_NODES = 30; // Limit nodes to avoid huge JSON and token limits

  function traverse(n, parentInfo = {}, depth = 0) {
    if (!n || depth > 10) return; // Limit depth to avoid deep recursion
    if (nodeCount >= MAX_NODES) return; // Limit total nodes

    const nodeInfo = {
      n: n.name, // Shortened key
      t: n.type, // Shortened key
      x: Math.round(n.x || 0),
      y: Math.round(n.y || 0),
      w: Math.round(n.width || 0), // Shortened key
      h: Math.round(n.height || 0), // Shortened key
    };

    // Extract colors (compact format)
    if (n.fills && Array.isArray(n.fills)) {
      n.fills.forEach((fill) => {
        if (fill.type === "SOLID" && fill.color) {
          const { r, g, b, a = 1 } = fill.color;
          const color = `rgba(${Math.round(r * 255)},${Math.round(
            g * 255
          )},${Math.round(b * 255)},${a})`;
          if (!tokens.colors.includes(color)) {
            tokens.colors.push(color);
          }
          nodeInfo.bg = color; // Shortened key
        } else if (fill.type === "IMAGE" && fill.imageRef) {
          nodeInfo.img = true; // Shortened key
        }
      });
    }

    // Extract text styles (compact)
    if (n.type === "TEXT" && n.style) {
      const fontInfo = {
        f: n.style.fontFamily, // Shortened
        s: Math.round(n.style.fontSize || 16), // Shortened
        w: n.style.fontWeight || 400, // Shortened
        lh: Math.round(n.style.lineHeightPx || n.style.fontSize * 1.2), // Shortened
      };
      if (
        !tokens.fonts.some(
          (f) => f.f === fontInfo.f && f.s === fontInfo.s && f.w === fontInfo.w
        )
      ) {
        tokens.fonts.push(fontInfo);
      }
      nodeInfo.font = fontInfo;
      if (n.characters) nodeInfo.txt = n.characters.substring(0, 100); // Limit text length
    }

    // Extract border radius
    if (n.cornerRadius !== undefined && n.cornerRadius > 0) {
      const br = Math.round(n.cornerRadius);
      if (!tokens.borderRadius.includes(br)) {
        tokens.borderRadius.push(br);
      }
      nodeInfo.br = br; // Shortened key
    }

    // Extract strokes (compact)
    if (
      n.strokes &&
      Array.isArray(n.strokes) &&
      n.strokes.length > 0 &&
      n.strokeWeight
    ) {
      const stroke = n.strokes[0];
      if (stroke.type === "SOLID" && stroke.color) {
        const { r, g, b, a = 1 } = stroke.color;
        nodeInfo.border = `${Math.round(n.strokeWeight)}px rgba(${Math.round(
          r * 255
        )},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
      }
    }

    // Extract effects (only shadows, compact)
    if (n.effects && Array.isArray(n.effects)) {
      const shadows = n.effects.filter(
        (e) => e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW"
      );
      if (shadows.length > 0) {
        nodeInfo.shadow = shadows[0].radius || 0; // Just store radius
      }
    }

    // Filter out status bar and home indicator elements
    const nodeNameLower = (n.name || "").toLowerCase();
    const isStatusBarElement =
      nodeNameLower.includes("status") ||
      nodeNameLower.includes("statusbar") ||
      nodeNameLower.includes("status-bar") ||
      nodeNameLower.includes("time") ||
      nodeNameLower.includes("clock") ||
      nodeNameLower.includes("wifi") ||
      nodeNameLower.includes("signal") ||
      nodeNameLower.includes("battery") ||
      nodeNameLower.includes("carrier") ||
      nodeNameLower.includes("notch") ||
      nodeNameLower.includes("safe area") ||
      nodeNameLower.includes("safearea") ||
      nodeNameLower.includes("home indicator") ||
      nodeNameLower.includes("homeindicator") ||
      nodeNameLower.includes("home bar") ||
      nodeNameLower.includes("homebar") ||
      nodeNameLower.includes("home button") ||
      nodeNameLower.includes("homebutton") ||
      nodeNameLower.includes("gesture bar") ||
      nodeNameLower.includes("gesturebar") ||
      (nodeNameLower.includes("indicator") &&
        (nodeNameLower.includes("home") || nodeNameLower.includes("bottom")));

    // Skip status bar elements from design tokens
    if (isStatusBarElement) {
      // Still traverse children in case there are non-status-bar elements inside
      if (n.children && depth < 8) {
        n.children.forEach((child) => traverse(child, nodeInfo, depth + 1));
      }
      return;
    }

    // Store node info only for important elements (limit to avoid huge JSON)
    const isImportant =
      n.type === "VECTOR" ||
      n.type === "COMPONENT" ||
      n.type === "INSTANCE" ||
      nodeInfo.img ||
      n.name?.toLowerCase().includes("icon") ||
      n.name?.toLowerCase().includes("image") ||
      n.name?.toLowerCase().includes("button") ||
      n.type === "TEXT" ||
      (n.type === "FRAME" && depth < 3); // Include top-level frames

    if (isImportant && nodeCount < MAX_NODES) {
      tokens.nodes.push(nodeInfo);
      nodeCount++;
    }

    // Traverse children (limit depth)
    if (n.children && depth < 8) {
      n.children.forEach((child) => traverse(child, nodeInfo, depth + 1));
    }
  }

  traverse(node);
  return tokens;
}

// Find image/icon nodes in the Figma structure
function findImageNodes(figmaNode, maxNodes = 20, depth = 0) {
  const imageNodes = [];
  if (!figmaNode || depth > 8) return imageNodes;

  const nodeName = (figmaNode.name || "").toLowerCase();

  // Filter out status bar and home indicator elements (time, wifi, signal, battery, home bar, etc.)
  const isStatusBarElement =
    nodeName.includes("status") ||
    nodeName.includes("statusbar") ||
    nodeName.includes("status-bar") ||
    nodeName.includes("time") ||
    nodeName.includes("clock") ||
    nodeName.includes("wifi") ||
    nodeName.includes("signal") ||
    nodeName.includes("battery") ||
    nodeName.includes("carrier") ||
    nodeName.includes("notch") ||
    nodeName.includes("safe area") ||
    nodeName.includes("safearea") ||
    nodeName.includes("home indicator") ||
    nodeName.includes("homeindicator") ||
    nodeName.includes("home bar") ||
    nodeName.includes("homebar") ||
    nodeName.includes("home button") ||
    nodeName.includes("homebutton") ||
    nodeName.includes("gesture bar") ||
    nodeName.includes("gesturebar") ||
    (nodeName.includes("indicator") &&
      (nodeName.includes("home") || nodeName.includes("bottom")));

  // Skip status bar elements
  if (isStatusBarElement) {
    return imageNodes;
  }

  const isImageNode =
    figmaNode.type === "VECTOR" ||
    figmaNode.type === "COMPONENT" ||
    figmaNode.type === "INSTANCE" ||
    figmaNode.type === "ELLIPSE" ||
    figmaNode.type === "RECTANGLE" ||
    (figmaNode.fills &&
      Array.isArray(figmaNode.fills) &&
      figmaNode.fills.some((fill) => fill.type === "IMAGE")) ||
    nodeName.includes("icon") ||
    nodeName.includes("image") ||
    nodeName.includes("logo") ||
    nodeName.includes("avatar") ||
    nodeName.includes("illustration") ||
    nodeName.includes("graphic");

  if (isImageNode && figmaNode.id) {
    // Get dimensions to help with positioning
    const dims = extractNodeDimensions(figmaNode);
    imageNodes.push({
      id: figmaNode.id,
      name: figmaNode.name || "Unknown",
      type: figmaNode.type,
      width: dims.width,
      height: dims.height,
      x: figmaNode.absoluteBoundingBox?.x || figmaNode.x || 0,
      y: figmaNode.absoluteBoundingBox?.y || figmaNode.y || 0,
    });
  }

  // Traverse children if we haven't reached the limit
  if (figmaNode.children && imageNodes.length < maxNodes && depth < 8) {
    for (const child of figmaNode.children) {
      const childImages = findImageNodes(
        child,
        maxNodes - imageNodes.length,
        depth + 1
      );
      imageNodes.push(...childImages);
      if (imageNodes.length >= maxNodes) break;
    }
  }

  return imageNodes;
}

// Extract images for specific nodes (icons, images, etc.)
async function extractNodeImages(fileKey, figmaNode) {
  const imageMap = {};

  // Find image nodes from the actual Figma structure
  const imageNodes = findImageNodes(figmaNode, 8); // Limit to 8 images to avoid token limits

  if (imageNodes.length === 0) {
    console.log("No image nodes found in Figma structure");
    return imageMap;
  }

  console.log(
    `Found ${imageNodes.length} potential image nodes:`,
    imageNodes.map((n) => `${n.name} (${n.type})`).join(", ")
  );

  try {
    const nodeIds = imageNodes.map((node) => node.id).join(",");
    const response = await axios.get(
      `https://api.figma.com/v1/images/${fileKey}`,
      {
        params: {
          ids: nodeIds,
          format: "png",
          scale: 1,
        },
        headers: {
          "X-Figma-Token": process.env.FIGMA_ACCESS_TOKEN,
        },
      }
    );

    console.log(
      "Figma images API response for nodes:",
      Object.keys(response.data.images || {}).length,
      "images returned"
    );

    if (response.data.images) {
      for (const [nodeId, imageUrl] of Object.entries(response.data.images)) {
        if (imageUrl) {
          const nodeInfo = imageNodes.find((n) => n.id === nodeId);
          console.log(
            `Downloading image for node: ${nodeInfo?.name || nodeId}`
          );

          // Download and convert to base64
          const imageResponse = await axios.get(imageUrl, {
            responseType: "arraybuffer",
          });
          imageMap[nodeId] = {
            url: imageUrl,
            base64: Buffer.from(imageResponse.data).toString("base64"),
            dataUrl: `data:image/png;base64,${Buffer.from(
              imageResponse.data
            ).toString("base64")}`,
            name: nodeInfo?.name || "Unknown",
            type: nodeInfo?.type || "UNKNOWN",
            width: nodeInfo?.width || 0,
            height: nodeInfo?.height || 0,
            x: nodeInfo?.x || 0,
            y: nodeInfo?.y || 0,
          };
        }
      }
    }
  } catch (error) {
    console.error("Error extracting node images:", error.message);
    if (error.response) {
      console.error(
        "API response:",
        JSON.stringify(error.response.data, null, 2)
      );
    }
    // Continue without images rather than failing
  }

  console.log(`Successfully extracted ${Object.keys(imageMap).length} images`);
  return imageMap;
}

// Upload paywall HTML endpoint (for backend uploads, not frontend)
app.post("/api/upload-paywall", upload.single("paywall"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const htmlContent = req.file.buffer.toString("utf-8");
    console.log(`Analyzing paywall HTML file: ${req.file.originalname}`);

    // Extract patterns from the uploaded paywall
    const patterns = extractPaywallPatterns(htmlContent);

    // Merge with existing patterns
    mergePaywallPatterns(patterns);

    console.log(
      `Analyzed paywall. Total paywalls analyzed: ${paywallPatterns.count}`
    );
    console.log(
      `Common colors: ${paywallPatterns.colors.length}, Fonts: ${paywallPatterns.fonts.length}`
    );

    res.json({
      success: true,
      message: "Paywall analyzed and patterns extracted",
      extractedPatterns: patterns,
      totalPaywallsAnalyzed: paywallPatterns.count,
      summary: {
        colors: paywallPatterns.colors.length,
        fonts: paywallPatterns.fonts.length,
        fontSizes: paywallPatterns.fontSizes?.length || 0,
        fontWeights: paywallPatterns.fontWeights?.length || 0,
        spacing: paywallPatterns.spacing.length,
        borderRadius: paywallPatterns.borderRadius.length,
        shadows: paywallPatterns.shadows?.length || 0,
        borders: paywallPatterns.borders?.length || 0,
        transitions: paywallPatterns.transitions?.length || 0,
        gaps: paywallPatterns.gaps?.length || 0,
        breakpoints: paywallPatterns.breakpoints?.length || 0,
      },
    });
  } catch (error) {
    console.error("Error analyzing paywall:", error);
    res.status(500).json({
      error: "Failed to analyze paywall",
      details: error.message,
    });
  }
});

// Upload multiple paywalls at once
app.post("/api/upload-paywalls", upload.array("paywalls", 20), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const results = [];
    for (const file of req.files) {
      try {
        const htmlContent = file.buffer.toString("utf-8");
        const patterns = extractPaywallPatterns(htmlContent);
        mergePaywallPatterns(patterns);
        results.push({
          filename: file.originalname,
          success: true,
          patterns: patterns,
        });
      } catch (error) {
        results.push({
          filename: file.originalname,
          success: false,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      message: `Analyzed ${results.filter((r) => r.success).length} of ${
        results.length
      } paywalls`,
      results: results,
      totalPaywallsAnalyzed: paywallPatterns.count,
      summary: {
        colors: paywallPatterns.colors.length,
        fonts: paywallPatterns.fonts.length,
        fontSizes: paywallPatterns.fontSizes?.length || 0,
        fontWeights: paywallPatterns.fontWeights?.length || 0,
        spacing: paywallPatterns.spacing.length,
        borderRadius: paywallPatterns.borderRadius.length,
        shadows: paywallPatterns.shadows?.length || 0,
        borders: paywallPatterns.borders?.length || 0,
        transitions: paywallPatterns.transitions?.length || 0,
        gaps: paywallPatterns.gaps?.length || 0,
        breakpoints: paywallPatterns.breakpoints?.length || 0,
      },
    });
  } catch (error) {
    console.error("Error analyzing paywalls:", error);
    res.status(500).json({
      error: "Failed to analyze paywalls",
      details: error.message,
    });
  }
});

// Get current paywall patterns
app.get("/api/paywall-patterns", (req, res) => {
  res.json({
    success: true,
    patterns: paywallPatterns,
    summary: {
      totalPaywallsAnalyzed: paywallPatterns.count,
      colors: paywallPatterns.colors.length,
      fonts: paywallPatterns.fonts.length,
      fontSizes: paywallPatterns.fontSizes?.length || 0,
      fontWeights: paywallPatterns.fontWeights?.length || 0,
      lineHeights: paywallPatterns.lineHeights?.length || 0,
      spacing: paywallPatterns.spacing.length,
      borderRadius: paywallPatterns.borderRadius.length,
      shadows: paywallPatterns.shadows?.length || 0,
      borders: paywallPatterns.borders?.length || 0,
      transitions: paywallPatterns.transitions?.length || 0,
      gaps: paywallPatterns.gaps?.length || 0,
      breakpoints: paywallPatterns.breakpoints?.length || 0,
      animations: paywallPatterns.animations?.length || 0,
    },
  });
});

// Clear all patterns (for reset)
app.delete("/api/paywall-patterns", (req, res) => {
  paywallPatterns = {
    colors: [],
    fonts: [],
    fontSizes: [],
    fontWeights: [],
    lineHeights: [],
    letterSpacing: [],
    spacing: [],
    borderRadius: [],
    shadows: [],
    borders: [],
    transitions: [],
    transforms: [],
    opacities: [],
    gradients: [],
    zIndex: [],
    gaps: [],
    widths: [],
    heights: [],
    displayTypes: [],
    flexProperties: [],
    gridProperties: [],
    positions: [],
    textTransforms: [],
    textDecorations: [],
    breakpoints: [],
    animations: [],
    layouts: [],
    commonStyles: {},
    componentStyles: {},
    count: 0,
  };
  res.json({
    success: true,
    message: "All paywall patterns cleared",
  });
});

// Main endpoint
app.post("/api/generate-paywall", async (req, res) => {
  try {
    const {
      figmaUrl,
      pageType = "paywall",
      generator = "claude",
      model = "gemini-3-flash",
    } = req.body;

    if (!figmaUrl) {
      return res.status(400).json({ error: "Figma URL is required" });
    }

    console.log(
      `🎨 [generate-paywall] Generating ${pageType} from Figma with ${generator}`
    );

    console.log("Processing Figma URL:", figmaUrl);

    // Extract file key and node ID
    const fileKey = extractFigmaFileKey(figmaUrl);
    if (!fileKey) {
      return res.status(400).json({ error: "Invalid Figma URL" });
    }

    let nodeIdFromUrl = extractNodeId(figmaUrl);
    console.log("Extracted node ID from URL:", nodeIdFromUrl);

    // Fetch Figma file data
    console.log("Fetching Figma file...");
    const figmaData = await fetchFigmaFile(fileKey);

    // If a node ID was provided in the URL, resolve it to the actual node ID
    let targetNode;
    let nodeId;

    if (nodeIdFromUrl) {
      // Resolve path-based ID to actual node ID
      console.log("Resolving node ID...");
      nodeId = await resolveNodeId(fileKey, nodeIdFromUrl);
      console.log("Resolved node ID:", nodeId);

      // Try to find the node in the file structure for design token extraction
      targetNode = findNodeById(figmaData.document, nodeId);
      if (!targetNode) {
        // Also try with the original path-based ID
        targetNode = findNodeById(figmaData.document, nodeIdFromUrl);
      }
    }

    // If no specific node, find the top-level frame
    if (!nodeId) {
      targetNode = findTopLevelNode(figmaData);
      if (!targetNode) {
        return res.status(400).json({
          error:
            "Could not find a frame to convert. Please select a specific frame in Figma.",
        });
      }
      nodeId = targetNode.id;
      console.log("Using top-level node:", targetNode.name, nodeId);
    }

    // Extract design tokens
    const designTokens = extractDesignTokens(targetNode || figmaData.document);
    console.log("Extracted design tokens");

    // Extract individual node images (icons, images, etc.) from the actual Figma structure
    console.log("Extracting node images...");
    const nodeImages = await extractNodeImages(
      fileKey,
      targetNode || figmaData.document
    );
    console.log(`Extracted ${Object.keys(nodeImages).length} node images`);

    // Get main frame image
    console.log("Fetching main frame image...");
    const imageBase64 = await getFigmaImage(fileKey, nodeId);

    // Extract dimensions from target node using multiple strategies
    let paywallDimensions = { width: 0, height: 0, isMobile: false };

    // Strategy 1: Extract from target node directly
    if (targetNode) {
      const dims = extractNodeDimensions(targetNode);
      if (dims.width > 0 && dims.height > 0) {
        paywallDimensions.width = dims.width;
        paywallDimensions.height = dims.height;
      }
    }

    // Strategy 2: If target node doesn't have dimensions, try children
    if (
      (paywallDimensions.width === 0 || paywallDimensions.height === 0) &&
      targetNode?.children?.length > 0
    ) {
      // Find the largest child frame (likely the main content)
      let largestChild = null;
      let largestArea = 0;

      for (const child of targetNode.children) {
        const dims = extractNodeDimensions(child);
        const area = dims.width * dims.height;
        if (area > largestArea && dims.width > 0 && dims.height > 0) {
          largestArea = area;
          largestChild = child;
        }
      }

      if (largestChild) {
        const dims = extractNodeDimensions(largestChild);
        if (paywallDimensions.width === 0 && dims.width > 0)
          paywallDimensions.width = dims.width;
        if (paywallDimensions.height === 0 && dims.height > 0)
          paywallDimensions.height = dims.height;
      }
    }

    // Strategy 3: Try to get from document structure (fallback)
    if (
      (paywallDimensions.width === 0 || paywallDimensions.height === 0) &&
      figmaData.document
    ) {
      // Look for the first page and frame
      if (
        figmaData.document.children &&
        figmaData.document.children.length > 0
      ) {
        const firstPage = figmaData.document.children[0];
        if (firstPage.children && firstPage.children.length > 0) {
          // Find the largest frame in the page
          let largestFrame = null;
          let largestArea = 0;

          for (const frame of firstPage.children) {
            if (
              frame.type === "FRAME" ||
              frame.type === "COMPONENT" ||
              frame.type === "INSTANCE"
            ) {
              const dims = extractNodeDimensions(frame);
              const area = dims.width * dims.height;
              if (area > largestArea && dims.width > 0 && dims.height > 0) {
                largestArea = area;
                largestFrame = frame;
              }
            }
          }

          if (largestFrame) {
            const dims = extractNodeDimensions(largestFrame);
            if (paywallDimensions.width === 0 && dims.width > 0)
              paywallDimensions.width = dims.width;
            if (paywallDimensions.height === 0 && dims.height > 0)
              paywallDimensions.height = dims.height;
          }
        }
      }
    }

    // Determine if it's mobile (typically width < 600px or height > width)
    // Better detection: mobile if width < 600px OR (portrait orientation with width < 800px)
    if (paywallDimensions.width > 0) {
      const isPortrait = paywallDimensions.height > paywallDimensions.width;
      paywallDimensions.isMobile =
        paywallDimensions.width < 600 ||
        (isPortrait && paywallDimensions.width < 800);
    }

    console.log(
      `Paywall dimensions: ${paywallDimensions.width}x${paywallDimensions.height}, Mobile: ${paywallDimensions.isMobile}`
    );

    // Debug: log node structure if dimensions are still 0
    if (paywallDimensions.width === 0 || paywallDimensions.height === 0) {
      console.warn("Could not extract dimensions from node. Node structure:", {
        hasTargetNode: !!targetNode,
        targetNodeType: targetNode?.type,
        targetNodeName: targetNode?.name,
        hasAbsoluteBoundingBox: !!targetNode?.absoluteBoundingBox,
        absoluteBoundingBox: targetNode?.absoluteBoundingBox,
        hasWidth: !!targetNode?.width,
        hasHeight: !!targetNode?.height,
        hasChildren: !!targetNode?.children,
        childrenCount: targetNode?.children?.length || 0,
        nodeId: nodeId,
      });

      // Try to log first child info
      if (targetNode?.children?.length > 0) {
        const firstChild = targetNode.children[0];
        console.warn("First child info:", {
          type: firstChild.type,
          name: firstChild.name,
          hasAbsoluteBoundingBox: !!firstChild.absoluteBoundingBox,
          absoluteBoundingBox: firstChild.absoluteBoundingBox,
          hasWidth: !!firstChild.width,
          hasHeight: !!firstChild.height,
        });
      }
    }

    // Check if using Cursor generator
    if (generator === "cursor") {
      console.log("🎨 [generate-paywall] Using Cursor for generation...");
      return await generatePaywallFromFigmaWithCursor(req, res, {
        figmaData,
        fileKey,
        nodeId,
        targetNode,
        designTokens,
        nodeImages,
        imageBase64,
        paywallDimensions,
        pageType,
        model,
      });
    }

    // Generate code with Claude
    console.log("Generating code with Claude...");

    // Build pattern guidance if we have analyzed paywalls
    let patternGuidance = "";
    if (paywallPatterns.count > 0) {
      console.log(
        `Using patterns from ${paywallPatterns.count} analyzed paywall(s) to guide generation`
      );

      const commonColors = paywallPatterns.colors.slice(0, 20).join(", ");
      const commonFonts = paywallPatterns.fonts.slice(0, 10).join(", ");
      const commonFontSizes =
        paywallPatterns.fontSizes
          ?.slice(0, 12)
          .map((s) => `${s}px`)
          .join(", ") || "";
      const commonFontWeights =
        paywallPatterns.fontWeights?.slice(0, 8).join(", ") || "";
      const commonLineHeights =
        paywallPatterns.lineHeights
          ?.slice(0, 10)
          .map((lh) => lh)
          .join(", ") || "";
      const commonSpacing = paywallPatterns.spacing
        .slice(0, 15)
        .map((s) => `${s}px`)
        .join(", ");
      const commonBorderRadius = paywallPatterns.borderRadius
        .slice(0, 12)
        .map((br) => `${br}px`)
        .join(", ");
      const commonShadows =
        paywallPatterns.shadows?.slice(0, 8).join("; ") || "";
      const commonBorders =
        paywallPatterns.borders?.slice(0, 8).join("; ") || "";
      const commonTransitions =
        paywallPatterns.transitions?.slice(0, 8).join("; ") || "";
      const commonGaps =
        paywallPatterns.gaps
          ?.slice(0, 10)
          .map((g) => `${g}px`)
          .join(", ") || "";
      const commonBreakpoints =
        paywallPatterns.breakpoints
          ?.slice(0, 8)
          .map((bp) => `${bp}px`)
          .join(", ") || "";

      patternGuidance = `

═══════════════════════════════════════════════════════════════
STYLE CONSISTENCY GUIDANCE (from ${paywallPatterns.count} analyzed paywall${
        paywallPatterns.count > 1 ? "s" : ""
      })
═══════════════════════════════════════════════════════════════

To ensure consistency with your existing paywalls, prefer these common patterns when they align with the Figma design:

COMMON COLORS (use when similar to Figma colors):
${commonColors || "None extracted"}

COMMON FONTS (prefer these font families):
${commonFonts || "None extracted"}

COMMON FONT SIZES (use for text elements):
${commonFontSizes || "None extracted"}

COMMON FONT WEIGHTS (use for text emphasis):
${commonFontWeights || "None extracted"}

COMMON LINE HEIGHTS (use for text readability):
${commonLineHeights || "None extracted"}

COMMON SPACING VALUES (use for padding/margin when appropriate):
${commonSpacing || "None extracted"}

COMMON BORDER RADIUS (use for rounded corners):
${commonBorderRadius || "None extracted"}

COMMON SHADOWS (use for depth/elevation):
${commonShadows || "None extracted"}

COMMON BORDERS (use for borders):
${commonBorders || "None extracted"}

COMMON TRANSITIONS (use for smooth animations):
${commonTransitions || "None extracted"}

COMMON GAPS (use for flexbox/grid spacing):
${commonGaps || "None extracted"}

COMMON BREAKPOINTS (use for responsive design):
${commonBreakpoints || "None extracted"}

IMPORTANT STYLE GUIDANCE:
- When the Figma design has colors similar to the common colors above, use the common colors for consistency
- Prefer the common fonts when they match the design aesthetic
- Use common spacing values when they align with the Figma layout
- Apply common border radius values for buttons, cards, and containers
- Use common shadow styles for similar elevation effects
- Balance pixel-perfect accuracy with style consistency - prioritize Figma accuracy but use common patterns when they align

═══════════════════════════════════════════════════════════════`;
    }

    const layoutType = paywallDimensions.isMobile ? "mobile" : "desktop";
    const containerWidth =
      paywallDimensions.width > 0
        ? paywallDimensions.width
        : paywallDimensions.isMobile
        ? 375
        : 1200;

    const prompt = `Recreate the Figma design as pixel-perfect HTML/CSS/JS.

Dimensions: ${paywallDimensions.width}px × ${paywallDimensions.height}px
${
  paywallDimensions.isMobile
    ? `CRITICAL: Width must be EXACTLY ${paywallDimensions.width}px. No overflow.`
    : `Container: ${containerWidth}px wide`
}

IGNORE: iPhone status bar (top) and home indicator (bottom). Only recreate app content.

Required CSS base:
\`\`\`css
* { margin: 0; padding: 0; box-sizing: border-box; }
   html, body {
     width: 100%;
     height: 100%;
  overflow-x: hidden;
     font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
body {
  display: flex;
  justify-content: center;
  align-items: flex-start;
     background: #ffffff;
  min-height: 100vh;
   }
   .paywall-container {
  width: ${paywallDimensions.width}px;
  max-width: ${paywallDimensions.width}px;
     min-height: ${paywallDimensions.height}px;
  position: relative;
     background: #ffffff;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
}
\`\`\`

Steps:
1. Build HTML structure with <div class="paywall-container"> matching the Figma layout
2. Use flexbox/grid for layout - avoid absolute positioning unless elements overlap
3. Apply colors, fonts, spacing from designTokens (see below)
4. Use {{IMAGE_X}} placeholders for images
5. Keep everything within ${paywallDimensions.width}px width

Design Tokens:
${JSON.stringify(designTokens, null, 2)}

Use tokens for:
- Colors: tokens.colors (exact rgba values)
- Fonts: tokens.fonts (family, size, weight, lineHeight)
- Spacing: tokens.spacing (padding/margin)
- Border radius: tokens.borderRadius
- Node positions: tokens.nodes (x, y, width, height, background, border-radius, fonts)

Output JSON format:
{
  "html": "<!-- HTML with <div class=\"paywall-container\"> -->",
  "css": "/* Complete CSS with reset + styles */",
  "js": "// JavaScript for interactivity"
}

${
  patternGuidance
    ? `\n\nStyle Patterns (use when matching Figma colors/fonts):\n${patternGuidance}`
    : ""
}

Generate valid JSON with complete working code.`;

    // Build content array with main frame image and extracted node images
    const content = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: imageBase64,
        },
      },
      {
        type: "text",
        text: "[Main Frame Image: Complete paywall design from Figma]",
      },
    ];

    // Add extracted node images (limit to 6 most important to avoid token limits)
    const nodeImageEntries = Object.entries(nodeImages).slice(0, 6);
    const imageReferences = [];

    for (let i = 0; i < nodeImageEntries.length; i++) {
      const [nodeId, img] = nodeImageEntries[i];
      const imageIndex = i + 1;
      const imageName = img.name || `Icon_${imageIndex}`;

      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: img.base64,
        },
      });

      content.push({
        type: "text",
        text: `[Image ${imageIndex}: ${imageName} (${img.type})]`,
      });

      imageReferences.push({
        index: imageIndex,
        name: imageName,
        type: img.type,
        dataUrl: img.dataUrl, // Keep dataUrl for the prompt
        width: img.width || 0,
        height: img.height || 0,
        x: img.x || 0,
        y: img.y || 0,
      });
    }

    // Add the main prompt with image references (use placeholders, not full data URLs)
    const promptWithReferences =
      prompt +
      (imageReferences.length > 0
        ? `\n\n═══════════════════════════════════════════════════════════════
EXTRACTED FIGMA IMAGES - USE THESE WITH EXACT POSITIONING
═══════════════════════════════════════════════════════════════

${imageReferences
  .map(
    (ref) =>
      `{{IMAGE_${ref.index}}} - ${ref.name} (${ref.type})\n  Position: x=${ref.x}px, y=${ref.y}px\n  Dimensions: ${ref.width}px × ${ref.height}px`
  )
  .join("\n\n")}

CRITICAL IMAGE PLACEMENT RULES:
1. Use the EXACT position (x, y) and dimensions (width, height) provided above
2. Place images using absolute positioning or flexbox with exact margins:
   - CSS: position: absolute; left: ${imageReferences[0]?.x || 0}px; top: ${
            imageReferences[0]?.y || 0
          }px; width: ${imageReferences[0]?.width || 0}px; height: ${
            imageReferences[0]?.height || 0
          }px;
   - OR use flexbox with margin-left and margin-top to achieve the same position
3. HTML format: <img src="{{IMAGE_X}}" alt="..." width="${
            imageReferences[0]?.width || 0
          }" height="${
            imageReferences[0]?.height || 0
          }" style="position: absolute; left: ${
            imageReferences[0]?.x || 0
          }px; top: ${imageReferences[0]?.y || 0}px;" />
4. NEVER recreate images with CSS shapes, gradients, or SVG paths
5. Match the exact position and size from the Figma design
6. The placeholders will be replaced with actual images server-side

═══════════════════════════════════════════════════════════════`
        : "");

    // Create a mapping of placeholders to actual data URLs for post-processing
    const imagePlaceholderMap = {};
    imageReferences.forEach((ref) => {
      imagePlaceholderMap[`{{IMAGE_${ref.index}}}`] = ref.dataUrl;
    });

    content.push({
      type: "text",
      text: promptWithReferences,
    });

    // claude-sonnet-4-5-20250929
    // claude-opus-4-5-20251101
    // claude-haiku-4-5-20251001
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 16384, // Increased to handle large CSS/HTML/JS responses
      messages: [
        {
          role: "user",
          content: content,
        },
      ],
    });

    // Extract the generated code
    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent) {
      throw new Error("No text response from Claude");
    }

    // Parse the JSON response
    let generatedCode;
    try {
      // Remove markdown code blocks if present (handle various formats)
      let jsonText = textContent.text.trim();

      // Remove markdown code blocks - handle ```json, ```, and any leading/trailing whitespace
      jsonText = jsonText.replace(/^```json\s*/i, ""); // Remove opening ```json
      jsonText = jsonText.replace(/^```\s*/g, ""); // Remove opening ```
      jsonText = jsonText.replace(/\s*```\s*$/g, ""); // Remove closing ```
      jsonText = jsonText.trim();

      // Try to find JSON object boundaries if response is malformed
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }

      generatedCode = JSON.parse(jsonText);

      // Replace image placeholders with actual base64 data URLs
      if (Object.keys(imagePlaceholderMap).length > 0) {
        Object.entries(imagePlaceholderMap).forEach(
          ([placeholder, dataUrl]) => {
            if (generatedCode.html) {
              generatedCode.html = generatedCode.html.replace(
                new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"),
                dataUrl
              );
            }
            if (generatedCode.css) {
              generatedCode.css = generatedCode.css.replace(
                new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"),
                dataUrl
              );
            }
            if (generatedCode.js) {
              generatedCode.js = generatedCode.js.replace(
                new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"),
                dataUrl
              );
            }
          }
        );
      }

      // Validate that we have the required fields
      if (!generatedCode.html || !generatedCode.css || !generatedCode.js) {
        throw new Error("Missing required fields in generated code");
      }

      // Ensure CSS has base styles to prevent black screen
      if (
        !generatedCode.css.includes("body") &&
        !generatedCode.css.includes("html")
      ) {
        const baseCSS = `* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #ffffff; }
.paywall-container { position: relative; width: ${containerWidth}px; min-height: ${paywallDimensions.height}px; margin: 0 auto; background: #ffffff; }
`;
        generatedCode.css = baseCSS + generatedCode.css;
      }

      // Ensure HTML has the container
      if (!generatedCode.html.includes("paywall-container")) {
        generatedCode.html = `<div class="paywall-container">${generatedCode.html}</div>`;
      }
    } catch (parseError) {
      console.error("Failed to parse Claude response");
      console.error("Parse error:", parseError.message);
      console.error("Response length:", textContent.text.length);
      console.error(
        "Response preview (first 500 chars):",
        textContent.text.substring(0, 500)
      );
      console.error(
        "Response preview (last 500 chars):",
        textContent.text.substring(Math.max(0, textContent.text.length - 500))
      );

      // Try to extract partial JSON if possible
      try {
        const jsonMatch = textContent.text.match(
          /\{[\s\S]*"html"[\s\S]*"css"[\s\S]*"js"[\s\S]*\}/
        );
        if (jsonMatch) {
          const partialJson = jsonMatch[0];
          // Try to close any unclosed strings/objects
          let fixedJson = partialJson;
          // Count quotes to see if strings are closed
          const quoteCount = (fixedJson.match(/"/g) || []).length;
          if (quoteCount % 2 !== 0) {
            fixedJson += '"';
          }
          // Try to close the JSON object
          if (!fixedJson.endsWith("}")) {
            fixedJson += "}";
          }
          generatedCode = JSON.parse(fixedJson);
          console.log("Successfully parsed partial JSON");

          // Replace image placeholders with actual base64 data URLs (recovery path)
          if (Object.keys(imagePlaceholderMap).length > 0) {
            Object.entries(imagePlaceholderMap).forEach(
              ([placeholder, dataUrl]) => {
                if (generatedCode.html) {
                  generatedCode.html = generatedCode.html.replace(
                    new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"),
                    dataUrl
                  );
                }
                if (generatedCode.css) {
                  generatedCode.css = generatedCode.css.replace(
                    new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"),
                    dataUrl
                  );
                }
                if (generatedCode.js) {
                  generatedCode.js = generatedCode.js.replace(
                    new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"),
                    dataUrl
                  );
                }
              }
            );
          }
        } else {
          throw parseError;
        }
      } catch (recoveryError) {
        throw new Error(
          `Failed to parse generated code: ${parseError.message}. Response may be truncated.`
        );
      }
    }

    console.log("Successfully generated paywall code");

    // Validate the generated code has proper structure
    if (
      generatedCode.css &&
      !generatedCode.css.includes("body") &&
      !generatedCode.css.includes(".paywall-container")
    ) {
      console.warn(
        "Generated CSS may be missing base styles, adding fallback..."
      );
      const baseCSS = `* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.paywall-container { position: relative; width: ${containerWidth}px; min-height: ${paywallDimensions.height}px; margin: 0 auto; }
`;
      generatedCode.css = baseCSS + generatedCode.css;
    }

    // Skip refinement for now - focus on getting base generation working first
    // Refinement can be re-enabled once base generation is stable
    console.log("Using initial generation (refinement disabled for stability)");

    // Create lightweight image metadata (without full base64 data)
    const imageMetadata = Object.entries(nodeImages).reduce(
      (acc, [nodeId, img]) => {
        const node = designTokens.nodes.find((n) => n.id === nodeId);
        acc[nodeId] = {
          name: node?.name || "Unknown",
          hasImage: true,
          // Don't include full base64 in response - it's already in the generated code
        };
        return acc;
      },
      {}
    );

    res.json({
      success: true,
      code: generatedCode,
      designTokens,
      imageMetadata, // Lightweight metadata about extracted images
      dimensions: paywallDimensions, // Pass dimensions to frontend
      metadata: {
        figmaFileKey: fileKey,
        nodeId: nodeId,
        nodeImageCount: Object.keys(nodeImages).length,
      },
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: error.message || "Failed to generate paywall",
      details: error.response?.data || error.stack,
    });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    figmaConfigured: !!process.env.FIGMA_ACCESS_TOKEN,
    claudeConfigured: !!process.env.ANTHROPIC_API_KEY,
  });
});

const PORT = process.env.PORT || 3000;
// Function to extract dominant colors from an image URL
async function extractColorsFromImage(imageUrl) {
  try {
    console.log("🎨 [extractColorsFromImage] Fetching image from:", imageUrl);

    // Fetch the image
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });

    const imageBuffer = Buffer.from(response.data);
    console.log(
      "🎨 [extractColorsFromImage] Image fetched, size:",
      imageBuffer.length
    );

    // Resize image to smaller size for faster processing (max 200x200)
    const resized = await sharp(imageBuffer)
      .resize(200, 200, { fit: "inside", withoutEnlargement: true })
      .toBuffer();

    // Extract raw pixel data
    const { data, info } = await sharp(resized)
      .raw()
      .toBuffer({ resolveWithObject: true });

    console.log(
      "🎨 [extractColorsFromImage] Image processed, dimensions:",
      info.width,
      "x",
      info.height
    );

    // Extract dominant colors using k-means-like approach
    // Sample pixels and find most common colors
    const colorMap = new Map();
    const sampleSize = Math.min(1000, data.length / 4); // Sample up to 1000 pixels

    for (let i = 0; i < sampleSize; i++) {
      const idx = Math.floor(Math.random() * (data.length / 4)) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Quantize colors to reduce noise (round to nearest 10)
      const qr = Math.round(r / 10) * 10;
      const qg = Math.round(g / 10) * 10;
      const qb = Math.round(b / 10) * 10;

      const colorKey = `${qr},${qg},${qb}`;
      colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1);
    }

    // Sort by frequency and get top colors
    const sortedColors = Array.from(colorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    console.log(
      "🎨 [extractColorsFromImage] Top colors found:",
      sortedColors.length
    );

    // Convert to hex and filter out very dark/light colors for better palette
    const colors = sortedColors
      .map(([rgb, count]) => {
        const [r, g, b] = rgb.split(",").map(Number);
        const hex = `#${[r, g, b]
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("")}`;
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return { hex, brightness, count, r, g, b };
      })
      .filter((c) => c.brightness > 30 && c.brightness < 240) // Filter very dark/light
      .sort((a, b) => b.count - a.count);

    if (colors.length === 0) {
      console.log(
        "⚠️ [extractColorsFromImage] No suitable colors found, using fallback"
      );
      return null;
    }

    // Determine primary, secondary, accent, and background colors
    const primary = colors[0];
    const secondary =
      colors.find((c) => Math.abs(c.brightness - primary.brightness) > 30) ||
      colors[1] ||
      primary;
    const accent =
      colors.find(
        (c) =>
          c.hex !== primary.hex && c.hex !== secondary.hex && c.brightness > 100
      ) ||
      colors[2] ||
      primary;

    // Background: use darkest suitable color or create from primary
    const background = colors.find((c) => c.brightness < 80) || {
      r: Math.max(0, primary.r - 40),
      g: Math.max(0, primary.g - 40),
      b: Math.max(0, primary.b - 40),
      hex: `#${[
        Math.max(0, primary.r - 40),
        Math.max(0, primary.g - 40),
        Math.max(0, primary.b - 40),
      ]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("")}`,
    };

    // Text color: white if background is dark, dark if light
    const text = background.brightness < 128 ? "#FFFFFF" : "#2C3E50";

    // Create gradient from primary to secondary
    const gradient = `linear-gradient(135deg, ${primary.hex} 0%, ${secondary.hex} 100%)`;

    const palette = {
      primary: primary.hex,
      secondary: secondary.hex,
      accent: accent.hex,
      background: background.hex,
      text: text,
      gradient: gradient,
    };

    console.log("✅ [extractColorsFromImage] Extracted palette:", palette);
    return palette;
  } catch (error) {
    console.error(
      "❌ [extractColorsFromImage] Error extracting colors:",
      error.message
    );
    console.error("❌ [extractColorsFromImage] Stack:", error.stack);
    return null;
  }
}

// Function to extract color palette based on category, theme, and visual elements
async function extractColorPalette(category, theme, iconUrl, screenshots) {
  console.log(
    "🎨 [extractColorPalette] Extracting colors for category:",
    category,
    "theme:",
    theme
  );

  let extractedColors = null;

  // Try to extract colors from icon first
  if (iconUrl) {
    console.log(
      "🎨 [extractColorPalette] Attempting to extract colors from icon..."
    );
    extractedColors = await extractColorsFromImage(iconUrl);

    if (extractedColors) {
      console.log(
        "✅ [extractColorPalette] Colors extracted from icon:",
        extractedColors
      );
      return {
        ...extractedColors,
        styles: {
          borderRadius: "16px",
          buttonStyle: "rounded-full",
          cardStyle: "glassmorphism",
          spacing: "compact",
          layout: "horizontal",
        },
      };
    }
  }

  // Fall back to category-based colors
  console.log("🎨 [extractColorPalette] Using category-based color palette");

  // Category-based color palettes
  const categoryColors = {
    Games: {
      primary: "#FF6B6B",
      secondary: "#4ECDC4",
      accent: "#FFE66D",
      background: "#1A1A2E",
      text: "#FFFFFF",
      gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    },
    Productivity: {
      primary: "#4A90E2",
      secondary: "#50C878",
      accent: "#FFD700",
      background: "#F5F7FA",
      text: "#2C3E50",
      gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    },
    "Health & Fitness": {
      primary: "#00D4AA",
      secondary: "#4ECDC4",
      accent: "#FF6B6B",
      background: "#0A0E27",
      text: "#FFFFFF",
      gradient: "linear-gradient(135deg, #00D4AA 0%, #4ECDC4 100%)",
    },
    Entertainment: {
      primary: "#FF6B9D",
      secondary: "#C44569",
      accent: "#F8B500",
      background: "#1A1A2E",
      text: "#FFFFFF",
      gradient: "linear-gradient(135deg, #FF6B9D 0%, #C44569 100%)",
    },
    Finance: {
      primary: "#2ECC71",
      secondary: "#3498DB",
      accent: "#F39C12",
      background: "#ECF0F1",
      text: "#2C3E50",
      gradient: "linear-gradient(135deg, #2ECC71 0%, #3498DB 100%)",
    },
    Education: {
      primary: "#9B59B6",
      secondary: "#3498DB",
      accent: "#E74C3C",
      background: "#FFFFFF",
      text: "#2C3E50",
      gradient: "linear-gradient(135deg, #9B59B6 0%, #3498DB 100%)",
    },
    "Social Networking": {
      primary: "#3498DB",
      secondary: "#9B59B6",
      accent: "#E74C3C",
      background: "#FFFFFF",
      text: "#2C3E50",
      gradient: "linear-gradient(135deg, #3498DB 0%, #9B59B6 100%)",
    },
    General: {
      primary: "#667eea",
      secondary: "#764ba2",
      accent: "#f093fb",
      background: "#1A1A2E",
      text: "#FFFFFF",
      gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    },
  };

  // Try to match category
  const categoryLower = (category || "").toLowerCase();
  const themeLower = (theme || "").toLowerCase();

  let palette = categoryColors["General"];

  for (const [key, colors] of Object.entries(categoryColors)) {
    if (
      categoryLower.includes(key.toLowerCase()) ||
      themeLower.includes(key.toLowerCase())
    ) {
      palette = colors;
      console.log("🎨 [extractColorPalette] Matched category:", key);
      break;
    }
  }

  // Additional style information
  const styles = {
    borderRadius: "16px",
    buttonStyle: "rounded-full",
    cardStyle: "glassmorphism",
    spacing: "compact",
    layout: "horizontal",
  };

  console.log("🎨 [extractColorPalette] Extracted palette:", palette);
  console.log("🎨 [extractColorPalette] Styles:", styles);

  return {
    ...palette,
    styles: styles,
  };
}

// Function to extract app information from App Store or Play Store URL
async function fetchAppInfo(appUrl) {
  try {
    console.log(
      "🔍 [fetchAppInfo] Starting app info extraction for URL:",
      appUrl
    );

    const isAppStore =
      appUrl.includes("apps.apple.com") || appUrl.includes("itunes.apple.com");
    const isPlayStore = appUrl.includes("play.google.com");

    console.log(
      "🔍 [fetchAppInfo] URL type - App Store:",
      isAppStore,
      "Play Store:",
      isPlayStore
    );

    if (!isAppStore && !isPlayStore) {
      throw new Error(
        "Invalid app URL. Please provide an App Store or Play Store URL."
      );
    }

    // Fetch the app page
    console.log("🔍 [fetchAppInfo] Fetching app page...");
    const response = await axios.get(appUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    console.log("🔍 [fetchAppInfo] Response status:", response.status);
    console.log(
      "🔍 [fetchAppInfo] Response data length:",
      response.data?.length || 0
    );

    const $ = cheerio.load(response.data);
    let appInfo = {};

    if (isAppStore) {
      console.log("🔍 [fetchAppInfo] Extracting App Store information...");

      // Extract App Store information
      appInfo.name =
        $("h1").first().text().trim() ||
        $('[data-testid="product-title"]').text().trim() ||
        $(".product-header__title").text().trim();

      appInfo.description =
        $('[data-testid="product-description"]').text().trim() ||
        $(".product-review__body").first().text().trim() ||
        $("p")
          .filter((i, el) => $(el).text().length > 100)
          .first()
          .text()
          .trim();

      appInfo.category =
        $('[data-testid="category"]').text().trim() ||
        $(".product-header__category").text().trim() ||
        $('a[href*="/genre/"]').first().text().trim();

      appInfo.developer =
        $('[data-testid="developer-name"]').text().trim() ||
        $(".product-header__identity").text().trim();

      appInfo.price =
        $('[data-testid="price"]').text().trim() ||
        $(".product-header__list__item--price").text().trim() ||
        "Free";

      // Extract app icon - multiple strategies for App Store
      appInfo.icon = null;

      // Strategy 1: Look for product image/icon in header
      const productImage = $(
        '[data-testid="product-image"] img, .product-header__icon img, .product-header__icon source'
      ).first();
      if (productImage.length) {
        appInfo.icon =
          productImage.attr("src") ||
          productImage.attr("srcset")?.split(",").pop()?.trim().split(" ")[0] ||
          productImage.attr("data-src");
      }

      // Strategy 2: Look for icon in picture elements
      if (!appInfo.icon) {
        const pictureSource = $(
          'picture source[type="image/png"], picture source[type="image/jpeg"]'
        ).first();
        if (pictureSource.length) {
          const srcset = pictureSource.attr("srcset");
          if (srcset) {
            // Get highest quality version
            const sources = srcset.split(",").map((s) => s.trim());
            const highest = sources[sources.length - 1];
            appInfo.icon = highest.split(" ")[0];
          }
        }
      }

      // Strategy 3: Look for images with specific dimensions (App Store icons are usually square, 512x512, 256x256, etc.)
      if (!appInfo.icon) {
        $("img").each((i, el) => {
          const $img = $(el);
          const src = $img.attr("src") || $img.attr("data-src") || "";
          const width = parseInt($img.attr("width")) || 0;
          const height = parseInt($img.attr("height")) || 0;

          // App Store icons are usually square and in specific size ranges
          if (src && width > 0 && height > 0) {
            const isSquare = Math.abs(width - height) < 10; // Allow small difference
            const isIconSize =
              width >= 200 && width <= 600 && height >= 200 && height <= 600;

            if (
              isSquare &&
              isIconSize &&
              !src.includes("screenshot") &&
              !src.includes("Screenshot") &&
              (src.includes("icon") ||
                src.includes("logo") ||
                src.includes("app") ||
                src.includes("mzstatic.com") ||
                src.includes("apple.com"))
            ) {
              appInfo.icon = src;
              return false; // Break loop
            }
          }
        });
      }

      // Strategy 4: Look for images in app header or product sections
      if (!appInfo.icon) {
        $(
          '.product-header img, [class*="app-icon"] img, [class*="product-icon"] img, [id*="icon"] img'
        ).each((i, el) => {
          const src = $(el).attr("src") || $(el).attr("data-src") || "";
          if (
            src &&
            !src.includes("screenshot") &&
            !src.includes("Screenshot")
          ) {
            appInfo.icon = src;
            return false; // Break loop
          }
        });
      }

      // Strategy 5: Fallback - look for any square image that might be an icon
      if (!appInfo.icon) {
        $("img").each((i, el) => {
          const $img = $(el);
          const src = $img.attr("src") || $img.attr("data-src") || "";
          const width = parseInt($img.attr("width")) || 0;
          const height = parseInt($img.attr("height")) || 0;

          if (src && width > 0 && height > 0) {
            const isSquare = Math.abs(width - height) < 20;
            const isReasonableSize = width >= 100 && width <= 1000;

            if (
              isSquare &&
              isReasonableSize &&
              !src.includes("screenshot") &&
              !src.includes("Screenshot") &&
              (src.includes("icon") ||
                src.includes("logo") ||
                src.includes("app") ||
                src.includes("mzstatic.com") ||
                src.includes("apple.com"))
            ) {
              appInfo.icon = src;
              return false; // Break loop
            }
          }
        });
      }

      // Strategy 6: Last resort - any image with "icon" in URL or alt text
      if (!appInfo.icon) {
        $(
          'img[alt*="icon" i], img[alt*="Icon" i], img[alt*="' +
            appInfo.name +
            '"]'
        ).each((i, el) => {
          const src = $(el).attr("src") || $(el).attr("data-src") || "";
          if (src && !src.includes("screenshot")) {
            appInfo.icon = src;
            return false;
          }
        });
      }

      // Clean up icon URL if found
      if (appInfo.icon) {
        // Remove query parameters that might limit size, or get highest quality
        if (appInfo.icon.includes("?")) {
          const baseUrl = appInfo.icon.split("?")[0];
          // Try to get higher resolution version
          if (appInfo.icon.includes("200x200")) {
            appInfo.icon = appInfo.icon.replace("200x200", "512x512");
          } else if (
            !appInfo.icon.includes("512x512") &&
            !appInfo.icon.includes("256x256")
          ) {
            // Keep original if already high res
            appInfo.icon = baseUrl;
          }
        }
        console.log("✅ [fetchAppInfo] App icon found:", appInfo.icon);
      } else {
        console.log("⚠️ [fetchAppInfo] App icon not found");
      }

      // Extract screenshots for color analysis - better selectors for App Store
      const screenshots = [];

      // Try multiple strategies for App Store screenshots
      // Strategy 1: Look for screenshot carousel images
      $(
        'picture source[media], img[class*="screenshot"], img[class*="screenshot"], img[alt*="screenshot" i], img[alt*="iPhone" i], img[alt*="iPad" i]'
      ).each((i, el) => {
        let src =
          $(el).attr("src") || $(el).attr("srcset") || $(el).attr("data-src");
        if (src) {
          // Get highest quality version
          if (src.includes(",")) {
            src = src.split(",").pop().trim().split(" ")[0];
          }
          // Filter out icon images
          if (
            src &&
            !src.includes("icon") &&
            !src.includes("logo") &&
            !src.includes("Icon") &&
            (src.includes("screenshot") ||
              src.includes("Screenshot") ||
              src.match(/\d{3,}x\d{3,}/))
          ) {
            if (screenshots.length < 5 && !screenshots.includes(src)) {
              screenshots.push(src);
            }
          }
        }
      });

      // Strategy 2: Look for images in screenshot containers
      $(
        '[class*="screenshot"], [data-testid*="screenshot"], [id*="screenshot"] img, source'
      ).each((i, el) => {
        let src =
          $(el).attr("src") || $(el).attr("srcset") || $(el).attr("data-src");
        if (src) {
          if (src.includes(",")) {
            src = src.split(",").pop().trim().split(" ")[0];
          }
          // Filter out icons and get actual screenshots
          if (
            src &&
            !src.includes("icon") &&
            !src.includes("logo") &&
            !src.includes("Icon") &&
            (src.includes("screenshot") ||
              src.match(/\d{3,}x\d{3,}/) ||
              $(el).closest('[class*="screenshot"]').length)
          ) {
            if (screenshots.length < 5 && !screenshots.includes(src)) {
              screenshots.push(src);
            }
          }
        }
      });

      // Strategy 3: Look for large images that might be screenshots
      $("img[width], img[height]").each((i, el) => {
        const width = parseInt($(el).attr("width")) || 0;
        const height = parseInt($(el).attr("height")) || 0;
        const src = $(el).attr("src") || $(el).attr("data-src");

        // Screenshots are usually tall (portrait) or wide (landscape), not square like icons
        if (
          src &&
          width > 200 &&
          height > 200 &&
          !src.includes("icon") &&
          !src.includes("logo") &&
          !src.includes("Icon") &&
          (width / height > 1.5 || height / width > 1.5) && // Not square
          screenshots.length < 5 &&
          !screenshots.includes(src)
        ) {
          screenshots.push(src);
        }
      });

      // Remove duplicates and limit
      appInfo.screenshots = [...new Set(screenshots)].slice(0, 5);

      // Extract theme from description and category
      appInfo.theme = appInfo.category || "General";

      console.log("🔍 [fetchAppInfo] Extracted visual elements:");
      console.log("  - Icon:", appInfo.icon);
      console.log("  - Screenshots:", appInfo.screenshots.length);

      console.log("🔍 [fetchAppInfo] Extracted App Store info:");
      console.log("  - Name:", appInfo.name);
      console.log("  - Category:", appInfo.category);
      console.log("  - Theme:", appInfo.theme);
      console.log("  - Developer:", appInfo.developer);
      console.log("  - Price:", appInfo.price);
      console.log("  - Description length:", appInfo.description?.length || 0);
    } else if (isPlayStore) {
      console.log("🔍 [fetchAppInfo] Extracting Play Store information...");

      // Extract Play Store information
      appInfo.name =
        $("h1").first().text().trim() || $('[itemprop="name"]').text().trim();

      appInfo.description =
        $('[itemprop="description"]').text().trim() ||
        $(".bARER").text().trim() ||
        $(".W4P4ne").first().text().trim();

      appInfo.category =
        $('[itemprop="genre"]').text().trim() ||
        $('a[href*="/store/apps/category/"]').first().text().trim();

      appInfo.developer =
        $('[itemprop="author"] [itemprop="name"]').text().trim() ||
        $(".qRlxAc").text().trim();

      appInfo.price =
        $('[itemprop="price"]').attr("content") ||
        $(".VfPpkd-rymPhb-ibnC6b").text().trim() ||
        "Free";

      // Extract app icon
      appInfo.icon =
        $('img[alt*="Icon"], img[alt*="icon"]').first().attr("src") ||
        $('[itemprop="image"]').attr("content") ||
        $("img")
          .filter((i, el) => {
            const src = $(el).attr("src") || "";
            const alt = $(el).attr("alt") || "";
            return (
              (src.includes("icon") ||
                src.includes("logo") ||
                alt.toLowerCase().includes("icon")) &&
              !src.includes("screenshot")
            );
          })
          .first()
          .attr("src");

      // Extract screenshots for color analysis - better selectors for Play Store
      const screenshots = [];

      // Strategy 1: Look for screenshot images in carousel
      $(
        'img[alt*="Screenshot" i], img[data-src*="screenshot" i], img[class*="screenshot" i]'
      ).each((i, el) => {
        let src =
          $(el).attr("src") ||
          $(el).attr("data-src") ||
          $(el).attr("data-srcset");
        if (src) {
          // Get highest quality version
          if (src.includes(",")) {
            src = src.split(",").pop().trim().split(" ")[0];
          }
          // Filter out icon images
          if (
            src &&
            !src.includes("icon") &&
            !src.includes("logo") &&
            !src.includes("Icon")
          ) {
            if (screenshots.length < 5 && !screenshots.includes(src)) {
              screenshots.push(src);
            }
          }
        }
      });

      // Strategy 2: Look for images in screenshot containers or carousels
      $(
        '[class*="screenshot" i], [data-testid*="screenshot" i], .screenshot-carousel img, [jsname*="screenshot"] img'
      ).each((i, el) => {
        let src =
          $(el).attr("src") ||
          $(el).attr("data-src") ||
          $(el).attr("data-srcset");
        if (src) {
          if (src.includes(",")) {
            src = src.split(",").pop().trim().split(" ")[0];
          }
          if (
            src &&
            !src.includes("icon") &&
            !src.includes("logo") &&
            !src.includes("Icon")
          ) {
            if (screenshots.length < 5 && !screenshots.includes(src)) {
              screenshots.push(src);
            }
          }
        }
      });

      // Strategy 3: Look for large rectangular images (screenshots are usually tall/wide)
      $('img[src^="https://"], img[data-src^="https://"]').each((i, el) => {
        const $el = $(el);
        const src = $el.attr("src") || $el.attr("data-src");
        const width = parseInt($el.attr("width")) || 0;
        const height = parseInt($el.attr("height")) || 0;

        // Screenshots are usually portrait or landscape, not square
        if (
          src &&
          width > 300 &&
          height > 300 &&
          !src.includes("icon") &&
          !src.includes("logo") &&
          !src.includes("Icon") &&
          (width / height > 1.3 || height / width > 1.3) && // Portrait or landscape
          screenshots.length < 5 &&
          !screenshots.includes(src)
        ) {
          screenshots.push(src);
        }
      });

      // Remove duplicates and limit
      appInfo.screenshots = [...new Set(screenshots)].slice(0, 5);

      appInfo.theme = appInfo.category || "General";

      console.log("🔍 [fetchAppInfo] Extracted visual elements:");
      console.log("  - Icon:", appInfo.icon);
      console.log("  - Screenshots:", appInfo.screenshots.length);

      console.log("🔍 [fetchAppInfo] Extracted Play Store info:");
      console.log("  - Name:", appInfo.name);
      console.log("  - Category:", appInfo.category);
      console.log("  - Theme:", appInfo.theme);
      console.log("  - Developer:", appInfo.developer);
      console.log("  - Price:", appInfo.price);
      console.log("  - Description length:", appInfo.description?.length || 0);
    }

    // Extract color palette based on category and theme
    appInfo.colorPalette = await extractColorPalette(
      appInfo.category,
      appInfo.theme,
      appInfo.icon,
      appInfo.screenshots
    );

    // Clean and validate extracted data
    console.log("🔍 [fetchAppInfo] Validating extracted data...");

    if (!appInfo.name || appInfo.name.length < 2) {
      console.log("⚠️ [fetchAppInfo] Name too short or missing, using default");
      appInfo.name = "App";
    }
    if (!appInfo.description || appInfo.description.length < 10) {
      console.log(
        "⚠️ [fetchAppInfo] Description too short or missing, using default"
      );
      appInfo.description = "A mobile application";
    }
    if (!appInfo.category) {
      console.log("⚠️ [fetchAppInfo] Category missing, using default");
      appInfo.category = "General";
    }
    if (!appInfo.theme) {
      console.log("⚠️ [fetchAppInfo] Theme missing, using category");
      appInfo.theme = appInfo.category || "General";
    }

    console.log(
      "✅ [fetchAppInfo] Final app info:",
      JSON.stringify(appInfo, null, 2)
    );
    console.log(
      "🎨 [fetchAppInfo] Color Palette:",
      JSON.stringify(appInfo.colorPalette, null, 2)
    );
    return appInfo;
  } catch (error) {
    console.error("❌ [fetchAppInfo] Error fetching app info:", error.message);
    console.error("❌ [fetchAppInfo] Error stack:", error.stack);
    throw new Error(`Failed to fetch app information: ${error.message}`);
  }
}

// Function to generate business models based on app information
async function generateBusinessModels(appInfo) {
  console.log(
    "🤖 [generateBusinessModels] Starting business model generation..."
  );
  console.log(
    "🤖 [generateBusinessModels] App info received:",
    JSON.stringify(appInfo, null, 2)
  );

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ [generateBusinessModels] ANTHROPIC_API_KEY is not set!");
    throw new Error("Claude API key is not configured");
  }

  console.log(
    "🤖 [generateBusinessModels] Claude API key configured, creating prompt..."
  );

  const prompt = `You are an expert in mobile app monetization and subscription business models. 

Based on the following app information, generate appropriate business models and pricing tiers for a paywall:

App Name: ${appInfo.name}
Category: ${appInfo.category}
Theme: ${appInfo.theme}
Description: ${appInfo.description}
Developer: ${appInfo.developer || "Unknown"}
Current Price: ${appInfo.price}

Generate 2-3 business model options with the following structure:

1. **Freemium Model** (if applicable)
   - Free tier features
   - Premium tier features
   - Pricing suggestions

2. **Subscription Tiers** (if applicable)
   - Basic/Starter tier
   - Pro/Premium tier
   - Enterprise tier (if applicable)
   - Monthly and annual pricing

3. **One-time Purchase** (if applicable)
   - Feature list
   - Pricing suggestion

For each model, provide:
- Clear value propositions
- Feature differentiation
- Recommended pricing (considering the app category and market)
- Target audience

Format the response as a structured JSON object with the following structure:
{
  "models": [
    {
      "type": "freemium|subscription|one-time",
      "name": "Model Name",
      "tiers": [
        {
          "name": "Tier Name",
          "price": "$X.XX/month or $XX.XX/year",
          "features": ["feature1", "feature2", ...],
          "valueProposition": "Why users should choose this"
        }
      ],
      "recommended": true/false
    }
  ],
  "recommendations": "Overall recommendations based on app category"
}

Return ONLY valid JSON, no additional text.`;

  try {
    console.log("🤖 [generateBusinessModels] Calling Claude API...");
    console.log("🤖 [generateBusinessModels] Prompt length:", prompt.length);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    console.log("🤖 [generateBusinessModels] Claude API response received");
    console.log(
      "🤖 [generateBusinessModels] Response type:",
      response.content[0].type
    );

    const content = response.content[0].text;
    console.log(
      "🤖 [generateBusinessModels] Response content length:",
      content?.length || 0
    );

    // Extract JSON from response
    console.log("🤖 [generateBusinessModels] Extracting JSON from response...");
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      console.log("🤖 [generateBusinessModels] JSON match found, parsing...");
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(
        "✅ [generateBusinessModels] Business models generated successfully"
      );
      return parsed;
    }

    // Fallback: try to parse entire content
    console.log(
      "🤖 [generateBusinessModels] No JSON match, trying to parse entire content..."
    );
    const parsed = JSON.parse(content);
    console.log(
      "✅ [generateBusinessModels] Business models parsed from full content"
    );
    return parsed;
  } catch (error) {
    console.error(
      "❌ [generateBusinessModels] Error generating business models:",
      error.message
    );
    console.error("❌ [generateBusinessModels] Error stack:", error.stack);
    // Return default business models
    return {
      models: [
        {
          type: "subscription",
          name: "Premium Subscription",
          tiers: [
            {
              name: "Monthly",
              price: "$9.99/month",
              features: [
                "Full access",
                "Premium features",
                "No ads",
                "Priority support",
              ],
              valueProposition: "Get full access to all features",
            },
            {
              name: "Annual",
              price: "$79.99/year",
              features: [
                "Full access",
                "Premium features",
                "No ads",
                "Priority support",
                "Save 33%",
              ],
              valueProposition: "Best value - save 33% with annual plan",
            },
          ],
          recommended: true,
        },
      ],
      recommendations:
        "Based on the app category, a subscription model is recommended.",
    };
  }
}

// Endpoint to generate paywall from app URL
app.post("/api/generate-paywall-from-app", async (req, res) => {
  try {
    console.log("🚀 [generate-paywall-from-app] Request received");
    console.log(
      "🚀 [generate-paywall-from-app] Request body:",
      JSON.stringify(req.body, null, 2)
    );

    const { appUrl, businessModel, pageType = "paywall" } = req.body;

    if (!appUrl) {
      console.error("❌ [generate-paywall-from-app] App URL is missing");
      return res.status(400).json({
        success: false,
        error: "App URL is required",
      });
    }

    console.log(
      "🚀 [generate-paywall-from-app] Fetching app information from:",
      appUrl
    );

    // Fetch app information
    const appInfo = await fetchAppInfo(appUrl);
    console.log(
      "✅ [generate-paywall-from-app] App info extracted successfully"
    );
    console.log(
      "✅ [generate-paywall-from-app] App info:",
      JSON.stringify(appInfo, null, 2)
    );

    // Use manual business model if provided, otherwise generate
    let businessModels;
    if (
      businessModel &&
      businessModel.models &&
      Array.isArray(businessModel.models)
    ) {
      console.log(
        "✅ [generate-paywall-from-app] Using manually provided business model"
      );
      businessModels = businessModel;
    } else {
      console.log(
        "🚀 [generate-paywall-from-app] Generating business models..."
      );
      businessModels = await generateBusinessModels(appInfo);
      console.log(
        "✅ [generate-paywall-from-app] Business models generated successfully"
      );
    }
    console.log(
      "✅ [generate-paywall-from-app] Business models:",
      JSON.stringify(businessModels, null, 2)
    );

    // Generate paywall HTML/CSS based on app theme and business models
    console.log("🚀 [generate-paywall-from-app] Generating paywall design...");

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error(
        "❌ [generate-paywall-from-app] ANTHROPIC_API_KEY is not set!"
      );
      throw new Error("Claude API key is not configured");
    }

    console.log("🚀 [generate-paywall-from-app] Creating paywall prompt...");

    // Log color palette and styles
    console.log("🎨 [generate-paywall-from-app] Color Palette:");
    console.log("  - Primary:", appInfo.colorPalette?.primary);
    console.log("  - Secondary:", appInfo.colorPalette?.secondary);
    console.log("  - Accent:", appInfo.colorPalette?.accent);
    console.log("  - Background:", appInfo.colorPalette?.background);
    console.log("  - Text:", appInfo.colorPalette?.text);
    console.log("  - Gradient:", appInfo.colorPalette?.gradient);
    console.log("🎨 [generate-paywall-from-app] Styles:");
    console.log(
      "  - Border Radius:",
      appInfo.colorPalette?.styles?.borderRadius
    );
    console.log("  - Button Style:", appInfo.colorPalette?.styles?.buttonStyle);
    console.log("  - Card Style:", appInfo.colorPalette?.styles?.cardStyle);
    console.log("  - Layout:", appInfo.colorPalette?.styles?.layout);

    // Build visual elements section
    let visualElementsSection = "";
    if (appInfo.icon) {
      visualElementsSection += `- App Icon URL: ${appInfo.icon}\n`;
      console.log(
        "🎨 [generate-paywall-from-app] App icon available:",
        appInfo.icon
      );
    }
    if (appInfo.screenshots && appInfo.screenshots.length > 0) {
      visualElementsSection += `- Screenshot URLs: ${appInfo.screenshots.join(
        ", "
      )}\n`;
      console.log(
        "🎨 [generate-paywall-from-app] Screenshots available:",
        appInfo.screenshots.length
      );
    }

    // Create prompt based on page type
    let paywallPrompt;
    if (pageType === "landing") {
      paywallPrompt = createLandingPagePrompt(appInfo, visualElementsSection);
    } else if (pageType === "about") {
      paywallPrompt = createAboutPagePrompt(appInfo, visualElementsSection);
    } else if (pageType === "features") {
      paywallPrompt = createFeaturesPagePrompt(appInfo, visualElementsSection);
    } else {
      // Default: Paywall
      paywallPrompt = `You are an expert web developer and UI/UX designer. Create a beautiful, rich, and modern paywall design for a mobile app based on the following information:

APP INFORMATION:
- Name: ${appInfo.name}
- Category: ${appInfo.category}
- Theme: ${appInfo.theme}
- Description: ${appInfo.description}
- Developer: ${appInfo.developer || "Unknown"}
- Current Price: ${appInfo.price}

COLOR PALETTE (USE THESE EXACT COLORS):
- Primary Color: ${appInfo.colorPalette?.primary || "#667eea"}
- Secondary Color: ${appInfo.colorPalette?.secondary || "#764ba2"}
- Accent Color: ${appInfo.colorPalette?.accent || "#f093fb"}
- Background Color: ${
        appInfo.colorPalette?.background || "#1A1A2E"
      } (USE THIS AS MAIN BACKGROUND - body { background: ${
        appInfo.colorPalette?.background || "#1A1A2E"
      }; })
- Text Color: ${appInfo.colorPalette?.text || "#FFFFFF"}
- Gradient: ${
        appInfo.colorPalette?.gradient ||
        "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
      }

STYLES:
- Border Radius: ${appInfo.colorPalette?.styles?.borderRadius || "16px"}
- Button Style: ${appInfo.colorPalette?.styles?.buttonStyle || "rounded-full"}
- Card Style: ${appInfo.colorPalette?.styles?.cardStyle || "glassmorphism"}
- Layout: ${appInfo.colorPalette?.styles?.layout || "horizontal"}

VISUAL ELEMENTS:
${
  visualElementsSection ||
  "- No visual elements available - use the provided color palette"
}

BUSINESS MODELS (CRITICAL - USE EXACT VALUES):
${JSON.stringify(businessModels, null, 2)}

CRITICAL INSTRUCTIONS FOR BUSINESS MODELS:
- You MUST use the EXACT pricing tiers, prices, names, descriptions, and features from the BUSINESS MODELS above.
- DO NOT generate, create, modify, add, or remove any pricing tiers.
- Use the exact price values, currency, period (month/year), and tier names as specified.
- Use the exact feature lists and descriptions for each tier as provided.
- Display the pricing exactly as shown in the business models - same format, same values.

DESIGN REQUIREMENTS:
Create a mobile-first paywall (375px width, 812px height) with:

1. **Background & Color Scheme (CRITICAL):**
   - USE THE EXACT BACKGROUND COLOR: ${
     appInfo.colorPalette?.background || "#1A1A2E"
   }
   - Apply this as the main body background color
   - Use the provided gradient for buttons and accents
   - Ensure the background color matches the app's theme perfectly
   - Use the primary, secondary, and accent colors for UI elements

2. **Layout - COMPACT HORIZONTAL TIERS:**
   - Display subscription tiers in a HORIZONTAL, COMPACT layout
   - CRITICAL: Use ONLY the exact tiers from BUSINESS MODELS section above - display all tiers that are provided, no more, no less.
   - Each tier should be a SMALL card (not full-width, not too tall)
   - Use flexbox or grid with horizontal scrolling if needed
   - Tier cards should be side-by-side, not stacked vertically
   - Each card should be approximately 280-300px wide, 200-250px tall
   - Use a horizontal scroll container if there are more than 2 tiers
   - Make tiers visually compact - reduce padding, use smaller fonts for features
   - Show pricing prominently using the EXACT prices from BUSINESS MODELS

3. **Tier Card Design:**
   - Small, compact cards with the provided border radius
   - Use glassmorphism effect (backdrop-filter: blur, semi-transparent background)
   - Each card should have: tier name (EXACT name from BUSINESS MODELS), price (EXACT price from BUSINESS MODELS), features (EXACT features from BUSINESS MODELS), CTA button
   - CRITICAL: Use the exact tier names, exact prices (including currency and format), and exact feature lists from BUSINESS MODELS - do not modify or add features.
   - Highlight recommended tier with border or glow effect (if marked as recommended in BUSINESS MODELS)
   - Use the accent color for "Most Popular" or "Best Value" badges (if specified in BUSINESS MODELS)
   - Keep cards visually balanced and not overwhelming

4. **Typography:**
   - Use modern, clean fonts (system fonts: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto)
   - Create clear hierarchy: large price, medium tier name, small features
   - Use the provided text color for readability

5. **Visual Elements:**
   - Include the app icon at the top if available (use <img src="${
     appInfo.icon || ""
   }" alt="App Icon">)
   - Use the provided gradient for buttons and decorative elements
   - Add subtle animations (fade-ins, slide-ups)
   - Use shadows and layering for depth
   - Keep decorative elements minimal to maintain compact layout

6. **Buttons & CTAs:**
   - Use the provided button style (rounded-full)
   - Apply the primary color or gradient for buttons
   - Make buttons compact but touch-friendly (44px height minimum)
   - Add hover effects and smooth transitions

7. **Mobile Optimization:**
   - Responsive design for mobile devices
   - Touch-friendly interactive elements
   - Proper viewport meta tag
   - Smooth scrolling for horizontal tier layout

IMPORTANT:
- The design should feel premium and match the app's category and theme
- Use colors extracted from the app icon/screenshots if available
- Make it visually rich and engaging, not plain or basic
- Include the app icon prominently if available
- Create a cohesive visual identity throughout
- Use modern CSS features (gradients, backdrop-filter, box-shadow, etc.)

Generate complete HTML, CSS, and JavaScript code. The paywall should be production-ready, visually stunning, and match the app's brand identity.

Return the code in this format:
\`\`\`html
[Complete HTML code with embedded CSS and JavaScript]
\`\`\`

Include all CSS in <style> tags and JavaScript in <script> tags. Make sure to use the app icon URL if provided.`;
    }

    console.log(
      "🚀 [generate-paywall-from-app] Calling Claude API for paywall generation..."
    );
    console.log(
      "🚀 [generate-paywall-from-app] Prompt length:",
      paywallPrompt.length
    );

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: paywallPrompt,
        },
      ],
    });

    console.log("✅ [generate-paywall-from-app] Claude API response received");
    console.log(
      "✅ [generate-paywall-from-app] Response type:",
      response.content[0].type
    );

    let generatedCode = response.content[0].text;
    console.log(
      "✅ [generate-paywall-from-app] Generated code length:",
      generatedCode?.length || 0
    );

    // Extract code from markdown code blocks if present
    console.log(
      "🚀 [generate-paywall-from-app] Extracting code from response..."
    );
    const codeMatch = generatedCode.match(/```(?:html)?\s*([\s\S]*?)```/);
    if (codeMatch) {
      console.log(
        "✅ [generate-paywall-from-app] Code block found, extracting..."
      );
      generatedCode = codeMatch[1].trim();
      console.log(
        "✅ [generate-paywall-from-app] Extracted code length:",
        generatedCode.length
      );
    } else {
      console.log(
        "⚠️ [generate-paywall-from-app] No code block found, using full response"
      );
    }

    // Ensure it's valid HTML
    console.log("🚀 [generate-paywall-from-app] Validating HTML structure...");
    if (
      !generatedCode.includes("<!DOCTYPE") &&
      !generatedCode.includes("<html")
    ) {
      console.log(
        "⚠️ [generate-paywall-from-app] No HTML structure found, wrapping code..."
      );
      generatedCode = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${appInfo.name} - Premium</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  </style>
</head>
<body>
${generatedCode}
</body>
</html>`;
    }

    console.log(
      "✅ [generate-paywall-from-app] Paywall generation completed successfully"
    );
    console.log(
      "✅ [generate-paywall-from-app] Final code length:",
      generatedCode.length
    );

    res.json({
      success: true,
      code: generatedCode,
      dimensions: {
        width: 375,
        height: 812,
        type: "Mobile",
      },
      appInfo: appInfo,
      businessModels: businessModels,
    });
  } catch (error) {
    console.error(
      "❌ [generate-paywall-from-app] Error generating paywall from app:",
      error.message
    );
    console.error("❌ [generate-paywall-from-app] Error stack:", error.stack);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to generate paywall from app URL",
    });
  }
});

// Helper functions for different page types
function createLandingPagePrompt(appInfo, visualElementsSection) {
  return `You are an expert web developer and UI/UX designer. Create a beautiful, rich, and modern landing page for a mobile app based on the following information:

APP INFORMATION:
- Name: ${appInfo.name}
- Category: ${appInfo.category}
- Theme: ${appInfo.theme}
- Description: ${appInfo.description}
- Developer: ${appInfo.developer || "Unknown"}
- Current Price: ${appInfo.price}

COLOR PALETTE (USE THESE EXACT COLORS):
- Primary Color: ${appInfo.colorPalette?.primary || "#667eea"}
- Secondary Color: ${appInfo.colorPalette?.secondary || "#764ba2"}
- Accent Color: ${appInfo.colorPalette?.accent || "#f093fb"}
- Background Color: ${
    appInfo.colorPalette?.background || "#1A1A2E"
  } (USE THIS AS MAIN BACKGROUND)
- Text Color: ${appInfo.colorPalette?.text || "#FFFFFF"}
- Gradient: ${
    appInfo.colorPalette?.gradient ||
    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
  }

VISUAL ELEMENTS:
${
  visualElementsSection ||
  "- No visual elements available - use the provided color palette"
}

DESIGN REQUIREMENTS:
Create a mobile-first landing page (375px width, flexible height) with:

1. **Hero Section** - Eye-catching header with app icon, name, tagline, and download CTA
2. **Features Section** - 3-5 key features with icons and descriptions
3. **Benefits Section** - Why users should download the app
4. **Social Proof** - Ratings, reviews, or download stats if available
5. **Final CTA** - Strong call-to-action to download

Use icons (SVG), smooth animations, modern CSS, and make it visually rich and engaging.
Return complete HTML with embedded CSS and JavaScript.`;
}

function createAboutPagePrompt(appInfo, visualElementsSection) {
  return `You are an expert web developer and UI/UX designer. Create a beautiful about page for ${appInfo.name} mobile app.

Include sections: Hero with app icon, Story/Description, Developer info, Mission, Contact.
Use the color palette from appInfo.colorPalette.
Return complete HTML with embedded CSS and JavaScript.`;
}

function createFeaturesPagePrompt(appInfo, visualElementsSection) {
  return `You are an expert web developer and UI/UX designer. Create a beautiful features showcase page for ${appInfo.name} mobile app.

Include: Hero section, Feature grid with icons, Feature categories, Visual demonstrations.
Use the color palette from appInfo.colorPalette.
Return complete HTML with embedded CSS and JavaScript.`;
}

// Import cursor generation module
const {
  generatePaywallWithCursor,
  runCursorAgent,
  findGeneratedHTML,
} = require("./generate-with-cursor");

// Helper function to generate paywall from Figma using Cursor
async function generatePaywallFromFigmaWithCursor(req, res, figmaData) {
  const {
    fileKey,
    nodeId,
    targetNode,
    designTokens,
    nodeImages,
    imageBase64,
    paywallDimensions,
    pageType,
    model = "gemini-3-flash",
  } = figmaData;

  try {
    // Create generation directory with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputDir = path.join(__dirname, "cursor-generations");
    const generationDir = path.join(outputDir, `generation-${timestamp}`);
    fs.mkdirSync(generationDir, { recursive: true });

    console.log(`📁 Created generation directory: ${generationDir}`);

    // Download images locally
    const imagesDir = path.join(generationDir, "images");
    fs.mkdirSync(imagesDir, { recursive: true });

    // Save main frame image
    const mainImagePath = path.join(imagesDir, "main-frame.png");
    const mainImageBuffer = Buffer.from(imageBase64, "base64");
    fs.writeFileSync(mainImagePath, mainImageBuffer);
    console.log(`✅ Saved main frame image`);

    // Save extracted node images
    const imageReferences = [];
    const nodeImageEntries = Object.entries(nodeImages).slice(0, 6);
    for (let i = 0; i < nodeImageEntries.length; i++) {
      const [nodeId, img] = nodeImageEntries[i];
      const imageIndex = i + 1;
      const ext = img.name?.match(/\.\w+$/)?.[0] || ".png";
      const imageName = `icon${imageIndex}${ext}`;
      const imagePath = path.join(imagesDir, imageName);
      const imageBuffer = Buffer.from(img.base64, "base64");
      fs.writeFileSync(imagePath, imageBuffer);
      imageReferences.push({
        index: imageIndex,
        name: imageName,
        path: `images/${imageName}`,
        nodeId: nodeId,
        x: img.x || 0,
        y: img.y || 0,
        width: img.width || 0,
        height: img.height || 0,
      });
      console.log(`✅ Saved node image: ${imageName}`);
    }

    // Prepare data.json with Figma information
    const data = {
      figmaInfo: {
        fileKey: fileKey,
        nodeId: nodeId,
        nodeName: targetNode?.name || "Unknown",
      },
      designTokens: designTokens,
      dimensions: paywallDimensions,
      imageReferences: imageReferences,
      timestamp: new Date().toISOString(),
    };
    const dataJsonPath = path.join(generationDir, "data.json");
    fs.writeFileSync(dataJsonPath, JSON.stringify(data, null, 2), "utf-8");
    console.log(`✅ Saved data.json`);

    // Create prompt for Figma generation
    const layoutType = paywallDimensions.isMobile ? "mobile" : "desktop";
    const containerWidth =
      paywallDimensions.width > 0
        ? paywallDimensions.width
        : paywallDimensions.isMobile
        ? 375
        : 1200;

    const prompt = `Recreate ../images/main-frame.png as pixel-perfect HTML/CSS.

Files: ../images/main-frame.png, ../data.json${
      imageReferences.length > 0 ? `, ../images/icon*.png` : ""
    }

${
  paywallDimensions.isMobile
    ? `CRITICAL: Width must be EXACTLY ${paywallDimensions.width}px. No horizontal overflow.`
    : `Container width: ${containerWidth}px`
}

Required CSS base:
\`\`\`css
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { 
  width: 100%; 
  height: 100%; 
  overflow-x: hidden;
  margin: 0;
  padding: 0;
}
body { 
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background: #ffffff;
  min-height: 100vh;
}
.container {
  width: ${paywallDimensions.width}px;
  max-width: ${paywallDimensions.width}px;
  min-height: ${paywallDimensions.height}px;
  position: relative;
  background: #ffffff;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
}
\`\`\`

Steps:
1. Create HTML with <div class="container"> wrapper
2. Ignore iPhone status bar (top) and home indicator (bottom) - only recreate app content
3. Use flexbox/grid for layout - match the structure from main-frame.png
4. Apply colors, fonts, spacing from data.json
5. Use ../images/ paths for images
6. Ensure everything fits within ${paywallDimensions.width}px width

Generate index.html with <style> and <script> tags. Match main-frame.png exactly.`;

    const promptPath = path.join(generationDir, "prompt.txt");
    fs.writeFileSync(promptPath, prompt, "utf-8");
    console.log(`✅ Saved prompt.txt`);

    // Create cursor subdirectory
    const cursorDir = path.join(generationDir, `cursor-${model}`);
    fs.mkdirSync(cursorDir, { recursive: true });

    // Modify prompt to reference parent directory
    const modifiedPrompt = prompt
      .replace(/\.\.\//g, "../")
      .replace(
        "You are inside a folder that already contains:",
        "IMPORTANT: All data files and images are in the PARENT directory (one level up).\n" +
          "Use paths like ../data.json, ../images/main-frame.png\n\n" +
          "You are inside a folder that already contains:"
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

      // Look for generated HTML file
      let generatedHtml = findGeneratedHTML(cursorDir);

      if (generatedHtml) {
        console.log(`✅ Found generated HTML (${generatedHtml.length} chars)`);

        // Fix image paths to use correct relative paths
        generatedHtml = generatedHtml.replace(
          /src=["']\.\.\/images\/([^"']+)["']/g,
          (match, imageName) => {
            // Convert to base64 data URL from saved images
            const imagePath = path.join(imagesDir, imageName);
            if (fs.existsSync(imagePath)) {
              const imageBuffer = fs.readFileSync(imagePath);
              const ext = path.extname(imageName).toLowerCase().slice(1);
              const mimeType =
                ext === "png"
                  ? "image/png"
                  : ext === "jpg" || ext === "jpeg"
                  ? "image/jpeg"
                  : "image/webp";
              const base64 = imageBuffer.toString("base64");
              return `src="data:${mimeType};base64,${base64}"`;
            }
            return match;
          }
        );

        // Save the result
        const resultPath = path.join(generationDir, "result.html");
        fs.writeFileSync(resultPath, generatedHtml, "utf-8");
        console.log(`✅ Saved result to: ${resultPath}`);

        res.json({
          success: true,
          code: generatedHtml,
          dimensions: paywallDimensions,
          generator: "cursor",
        });
      } else {
        throw new Error("No HTML file was generated by cursor-agent");
      }
    } catch (error) {
      console.error(`❌ Error running cursor-agent: ${error.message}`);
      throw error;
    } finally {
      process.chdir(originalDir);
    }
  } catch (error) {
    console.error("Error generating from Figma with Cursor:", error);
    res.status(500).json({
      success: false,
      error:
        error.message || "Failed to generate paywall from Figma with Cursor",
    });
  }
}

// API endpoint for generating paywall with Cursor
app.post("/api/generate-paywall-with-cursor", async (req, res) => {
  try {
    console.log("🚀 [generate-paywall-with-cursor] Request received");
    const {
      appUrl,
      model = "auto",
      businessModel,
      pageType = "paywall",
    } = req.body;

    if (!appUrl) {
      return res.status(400).json({
        success: false,
        error: "App URL is required",
      });
    }

    console.log(
      "🚀 [generate-paywall-with-cursor] Fetching app information..."
    );
    const appInfo = await fetchAppInfo(appUrl);

    // Use manual business model if provided, otherwise generate
    let businessModels;
    if (
      businessModel &&
      businessModel.models &&
      Array.isArray(businessModel.models)
    ) {
      console.log(
        "✅ [generate-paywall-with-cursor] Using manually provided business model"
      );
      businessModels = businessModel;
    } else {
      console.log(
        "🚀 [generate-paywall-with-cursor] Generating business models..."
      );
      businessModels = await generateBusinessModels(appInfo);
    }

    console.log(
      `🚀 [generate-paywall-with-cursor] Generating ${pageType} with Cursor...`
    );
    const generatedCode = await generatePaywallWithCursor(
      appInfo,
      businessModels,
      { model, pageType }
    );

    console.log("✅ [generate-paywall-with-cursor] Generation completed");

    res.json({
      success: true,
      code: generatedCode,
      dimensions: {
        width: 375,
        height: 812,
        type: "Mobile",
        isMobile: true,
      },
      appInfo: appInfo,
      businessModels: businessModels,
      generator: "cursor",
    });
  } catch (error) {
    console.error("❌ [generate-paywall-with-cursor] Error:", error.message);
    console.error(
      "❌ [generate-paywall-with-cursor] Error stack:",
      error.stack
    );
    res.status(500).json({
      success: false,
      error: error.message || "Failed to generate paywall with Cursor",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(
    "Figma token:",
    process.env.FIGMA_ACCESS_TOKEN ? "Configured ✓" : "Missing ✗"
  );
  console.log(
    "Claude API key:",
    process.env.ANTHROPIC_API_KEY ? "Configured ✓" : "Missing ✗"
  );
  console.log("Cursor agent:", "Available (uses cursor-agent command)");
});
