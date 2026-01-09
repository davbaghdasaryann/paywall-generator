const API_BASE_URL = "http://localhost:3000";

const form = document.getElementById("paywallForm");
const figmaForm = document.getElementById("figmaForm");
const figmaUrlInput = document.getElementById("figmaUrl");
const appUrlInput = document.getElementById("appUrl");
const generateBtn = document.getElementById("generateBtn");
const generateFigmaBtn = document.getElementById("generateFigmaBtn");
const errorMessage = document.getElementById("errorMessage");
const previewSection = document.getElementById("previewSection");
const paywallPreview = document.getElementById("paywallPreview");
const downloadBtn = document.getElementById("downloadBtn");
const exampleFilesInput = document.getElementById("exampleFiles");
const exampleCodeTextarea = document.getElementById("exampleCode");
const addExampleBtn = document.getElementById("addExampleBtn");
const fileList = document.getElementById("fileList");
const exampleList = document.getElementById("exampleList");
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const sourceTabs = document.querySelectorAll(".source-tab");
const figmaInputGroup = document.getElementById("figmaInputGroup");
const appInputGroup = document.getElementById("appInputGroup");
const generatorGroup = document.getElementById("generatorGroup");
const generatorSelect = document.getElementById("generator");
const pageTypeSelect = document.getElementById("pageType");
const businessModelGroup = document.getElementById("businessModelGroup");
const businessModelJson = document.getElementById("businessModelJson");
const businessModelEditor = document.getElementById("businessModelEditor");
const toggleBusinessModel = document.getElementById("toggleBusinessModel");
const validateBusinessModel = document.getElementById("validateBusinessModel");
const clearBusinessModel = document.getElementById("clearBusinessModel");
const businessModelError = document.getElementById("businessModelError");

let currentSource = "figma";

// Show/hide business model editor based on page type and source
function updateBusinessModelVisibility() {
  if (!pageTypeSelect || !businessModelGroup) return;

  const pageType = pageTypeSelect.value || "paywall";
  // Only show business model for paywall type and app source
  const shouldShow = pageType === "paywall" && currentSource === "app";
  businessModelGroup.style.display = shouldShow ? "block" : "none";

  // Also hide the editor if it was open
  if (!shouldShow && businessModelEditor) {
    businessModelEditor.style.display = "none";
    if (toggleBusinessModel) {
      const svg = toggleBusinessModel.querySelector("svg");
      if (svg) svg.style.transform = "rotate(0deg)";
    }
  }
}

if (pageTypeSelect && businessModelGroup) {
  pageTypeSelect.addEventListener("change", updateBusinessModelVisibility);

  // Also update when source changes (for old style tabs)
  const sourceTabsForUpdate = document.querySelectorAll(".source-tab");
  sourceTabsForUpdate.forEach((tab) => {
    tab.addEventListener("click", () => {
      setTimeout(updateBusinessModelVisibility, 10);
    });
  });

  // Initial check - show if App Store tab is active and page type is paywall
  setTimeout(() => {
    const activeBuilderTab = document.querySelector(
      ".sidebar-tab.active, .builder-tab.active"
    );
    if (activeBuilderTab) {
      const builderId = activeBuilderTab.getAttribute("data-builder");
      if (builderId === "app") {
        currentSource = "app";
        updateBusinessModelVisibility();
      }
    }
  }, 100);
}

// Navigation handling - simple page navigation
const navLinks = document.querySelectorAll(".nav-link");

if (navLinks.length > 0) {
  // Set active nav link on page load based on current page
  const currentPath = window.location.pathname;
  const currentPage = currentPath.split("/").pop() || "index.html";

  navLinks.forEach((link) => {
    const href = link.getAttribute("href");
    if (href && !href.startsWith("#")) {
      const linkPage = href.split("/").pop();
      // Match current page with link
      if (
        (currentPage === "builder.html" && linkPage === "builder.html") ||
        (currentPage === "index.html" && linkPage === "index.html")
      ) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    }
  });

  // For navigation links, allow normal browser navigation
  // Only handle active state on click for immediate feedback
  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      // If it's a hash link (anchor), prevent default and scroll
      if (href && href.startsWith("#")) {
        e.preventDefault();
        const sectionId = href.substring(1);
        const section = document.getElementById(sectionId);
        if (section) {
          navLinks.forEach((l) => l.classList.remove("active"));
          link.classList.add("active");
          section.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      } else {
        // For page navigation, update active state immediately for visual feedback
        // The page will reload anyway
        navLinks.forEach((l) => l.classList.remove("active"));
        link.classList.add("active");
      }
    });
  });
}

// Builder tabs switching (support both old and new styles)
const builderTabs = document.querySelectorAll(".builder-tab, .sidebar-tab");
const builderContents = document.querySelectorAll(".builder-content");

if (builderTabs.length > 0) {
  builderTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const builderId = tab.getAttribute("data-builder");

      // Update currentSource for business model visibility
      currentSource = builderId;

      // Update active tab
      builderTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      // Show/hide builders
      builderContents.forEach((b) => {
        if (b.id === `${builderId}-builder`) {
          b.style.display = "block";
          b.classList.add("active");
        } else {
          b.style.display = "none";
          b.classList.remove("active");
        }
      });

      // Update business model visibility when switching tabs
      if (businessModelGroup) {
        updateBusinessModelVisibility();
      }
    });
  });
}

// Scroll functions
function scrollToGenerator() {
  const generatorSection = document.getElementById("generator");
  if (generatorSection) {
    generatorSection.scrollIntoView({ behavior: "smooth", block: "start" });
    // Update nav
    if (navLinks.length > 0) {
      navLinks.forEach((l) => l.classList.remove("active"));
      const genLink = document.querySelector('[data-section="generator"]');
      if (genLink) genLink.classList.add("active");
    }
  }
}

function scrollToAction() {
  scrollToGenerator();
}

// Source tab switching (old style - for backwards compatibility)
if (sourceTabs.length > 0) {
  sourceTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const source = tab.getAttribute("data-source");
      currentSource = source;

      // Update active tab
      sourceTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      // Show/hide input groups
      const pageType = pageTypeSelect?.value || "paywall";

      if (source === "figma") {
        if (figmaInputGroup) figmaInputGroup.style.display = "block";
        if (appInputGroup) appInputGroup.style.display = "none";
        if (generatorGroup) generatorGroup.style.display = "none";
        if (businessModelGroup) businessModelGroup.style.display = "none";
        if (figmaUrlInput) figmaUrlInput.required = true;
        if (appUrlInput) appUrlInput.required = false;
      } else {
        if (figmaInputGroup) figmaInputGroup.style.display = "none";
        if (appInputGroup) appInputGroup.style.display = "block";
        if (generatorGroup) generatorGroup.style.display = "block";
        // Only show business model for paywall type
        if (businessModelGroup) {
          businessModelGroup.style.display =
            pageType === "paywall" ? "block" : "none";
        }
        if (figmaUrlInput) figmaUrlInput.required = false;
        if (appUrlInput) appUrlInput.required = true;
      }

      // Update business model visibility
      updateBusinessModelVisibility();
    });
  });
}

let generatedCode = null;
let referenceExamples = []; // Store parsed example paywalls

// Tab switching functionality
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetTab = btn.getAttribute("data-tab");

    // Update active tab button
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    // Update active tab content
    tabContents.forEach((content) => {
      content.classList.remove("active");
      if (content.id === `${targetTab}-tab`) {
        content.classList.add("active");
      }
    });
  });
});

// Figma form handler
if (figmaForm) {
  figmaForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const figmaUrl = figmaUrlInput.value.trim();
    const figmaGeneratorSelect = document.getElementById("figmaGenerator");
    const generator = figmaGeneratorSelect?.value || "claude";

    if (!figmaUrl) {
      showError("Please enter a Figma URL");
      return;
    }

    // Hide previous errors and preview
    hideError();
    previewSection.style.display = "none";

    // Reset container width
    const container = document.querySelector(".container");
    if (container) container.classList.remove("has-preview");

    // Show loading state
    setLoading(true);

    try {
      console.log("🔍 [Frontend] Figma generator:", generator);
      console.log("🔍 [Frontend] Using endpoint: /api/generate-paywall");

      const response = await fetch(`${API_BASE_URL}/api/generate-paywall`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          figmaUrl,
          generator: generator,
          model: "gemini-3-flash",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate from Figma");
      }

      // Display result
      displayPaywall(
        data.code,
        data.dimensions,
        data.appInfo,
        data.businessModels
      );

      // Show preview panel in IDE layout
      if (previewSection) {
        previewSection.style.display = "flex";
      }
    } catch (error) {
      console.error("Error generating from Figma:", error);
      showError(
        error.message || "Failed to generate from Figma. Please try again."
      );
    } finally {
      setLoading(false);
    }
  });
}

// App Store form handler
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const appUrl = appUrlInput.value.trim();

    if (!appUrl) {
      showError("Please enter an App Store or Play Store URL");
      return;
    }

    // Hide previous errors and preview
    hideError();
    if (previewSection) previewSection.style.display = "none";

    // Reset container width
    const container = document.querySelector(".container");
    if (container) container.classList.remove("has-preview");

    // Show loading state
    setLoading(true);

    try {
      // Check which generator to use - find it in the form context to ensure we get the right one
      const generatorSelectInForm =
        form.querySelector("#generator") || generatorSelect;
      console.log(
        "🔍 [Frontend] Generator select element:",
        generatorSelectInForm
      );
      console.log(
        "🔍 [Frontend] Generator select value:",
        generatorSelectInForm?.value
      );
      const generator = generatorSelectInForm?.value || "claude";
      console.log("🔍 [Frontend] Selected generator:", generator);
      const endpoint =
        generator === "cursor"
          ? "/api/generate-paywall-with-cursor"
          : "/api/generate-paywall-from-app";
      console.log("🔍 [Frontend] Using endpoint:", endpoint);

      // Get manual business model if provided (from form or JSON)
      let manualBusinessModel = null;

      // Sync form to JSON first
      syncToJson();

      const businessModelText = businessModelJson?.value.trim();
      if (businessModelText) {
        try {
          manualBusinessModel = JSON.parse(businessModelText);
          // Validate structure
          if (
            !manualBusinessModel.models ||
            !Array.isArray(manualBusinessModel.models)
          ) {
            throw new Error("Missing 'models' array in business model");
          }
        } catch (error) {
          showError(`Invalid business model: ${error.message}`);
          setLoading(false);
          return;
        }
      }

      // Find pageType select in form context as well
      const pageTypeSelectInForm =
        form.querySelector("#pageType") || pageTypeSelect;
      const pageType = pageTypeSelectInForm?.value || "paywall";

      console.log("🔍 [Frontend] Page type:", pageType);
      console.log("🔍 [Frontend] Business model:", manualBusinessModel);

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          appUrl,
          model: "gemini-3-flash",
          businessModel: manualBusinessModel,
          pageType: pageType,
        }),
      });

      const data = await response.json();

      console.log("📱 [Frontend] Response received");
      console.log("📱 [Frontend] Response success:", data.success);
      console.log("📱 [Frontend] Has code:", !!data.code);
      console.log("📱 [Frontend] Code type:", typeof data.code);
      console.log("📱 [Frontend] Dimensions:", data.dimensions);
      console.log("📱 [Frontend] Full response:", data);

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate paywall");
      }

      if (data.success && data.code) {
        generatedCode = data.code;

        console.log(
          "📱 [Frontend] Calling displayPaywall with code and dimensions"
        );

        // Expand container width when preview is shown
        const container = document.querySelector(".container");
        if (container) container.classList.add("has-preview");

        displayPaywall(data.code, data.dimensions);
        if (previewSection) previewSection.style.display = "flex";
      } else {
        console.error(
          "❌ [Frontend] Invalid response - success:",
          data.success,
          "has code:",
          !!data.code
        );
        throw new Error("Invalid response from server");
      }
    } catch (error) {
      console.error("Error:", error);
      showError(
        error.message ||
          "Failed to generate paywall. Please check your URL and try again."
      );
    } finally {
      setLoading(false);
    }
  });

  function displayPaywall(code, dimensions = null) {
    console.log("📱 [displayPaywall] Displaying paywall...");
    console.log("📱 [displayPaywall] Code type:", typeof code);
    console.log(
      "📱 [displayPaywall] Code length:",
      code?.length || (code ? Object.keys(code).length : 0)
    );
    console.log("📱 [displayPaywall] Dimensions:", dimensions);

    let fullHtml;

    // Check if code is already a complete HTML string (from app URL)
    if (
      typeof code === "string" &&
      (code.includes("<!DOCTYPE") || code.includes("<html"))
    ) {
      console.log(
        "📱 [displayPaywall] Code is complete HTML string, using as-is"
      );
      fullHtml = code;
    }
    // Check if code is an object with html, css, js properties (from Figma)
    else if (typeof code === "object" && code.html) {
      console.log(
        "📱 [displayPaywall] Code is object with html/css/js, constructing HTML"
      );
      fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Paywall</title>
    <style>
        ${code.css || ""}
    </style>
</head>
<body>
    ${code.html || ""}
    <script>
        ${code.js || ""}
    </script>
</body>
</html>
    `;
    }
    // Fallback: treat as HTML string
    else {
      console.log(
        "📱 [displayPaywall] Code format unknown, treating as HTML string"
      );
      fullHtml =
        code || "<html><body><p>No content generated</p></body></html>";
    }

    console.log("📱 [displayPaywall] Full HTML length:", fullHtml.length);
    console.log(
      "📱 [displayPaywall] Full HTML preview (first 200 chars):",
      fullHtml.substring(0, 200)
    );

    // Create a blob URL and display in iframe
    const blob = new Blob([fullHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    console.log("📱 [displayPaywall] Blob URL created:", url);

    // Check if it's a mobile paywall
    const isMobile =
      dimensions?.type === "Mobile" || dimensions?.isMobile || false;
    const width = dimensions?.width || 375;
    const height = dimensions?.height || 812;

    console.log("📱 [displayPaywall] Is mobile:", isMobile);
    console.log("📱 [displayPaywall] Dimensions:", width, "x", height);
    console.log("📱 [displayPaywall] Dimensions object:", dimensions);

    // Get content wrapper and preview section
    const contentWrapper = document.getElementById("contentWrapper");
    const previewSection = document.getElementById("previewSection");

    if (isMobile) {
      // Display in iPhone frame for mobile paywalls - side by side layout
      previewSection.classList.add("mobile-preview");
      previewSection.classList.remove("desktop-preview");
      contentWrapper.classList.add("has-mobile-preview");

      // Phone models with dimensions and design characteristics
      const phoneModels = {
        "iphone-14-pro": {
          name: "iPhone 14 Pro",
          width: 393,
          height: 852,
          color: "#1d1d1f",
          borderRadius: "47px",
          notch: "dynamic",
        },
        "iphone-14": {
          name: "iPhone 14",
          width: 390,
          height: 844,
          color: "#1d1d1f",
          borderRadius: "47px",
          notch: "standard",
        },
        "iphone-13-pro": {
          name: "iPhone 13 Pro",
          width: 390,
          height: 844,
          color: "#2c2c2e",
          borderRadius: "45px",
          notch: "standard",
        },
        "iphone-13": {
          name: "iPhone 13",
          width: 390,
          height: 844,
          color: "#ffffff",
          borderRadius: "45px",
          notch: "standard",
        },
        "iphone-12-pro": {
          name: "iPhone 12 Pro",
          width: 390,
          height: 844,
          color: "#1d1d1f",
          borderRadius: "42px",
          notch: "standard",
        },
        "iphone-12": {
          name: "iPhone 12",
          width: 390,
          height: 844,
          color: "#ffffff",
          borderRadius: "42px",
          notch: "standard",
        },
        "iphone-11-pro": {
          name: "iPhone 11 Pro",
          width: 375,
          height: 812,
          color: "#1d1d1f",
          borderRadius: "38px",
          notch: "standard",
        },
        "iphone-11": {
          name: "iPhone 11",
          width: 414,
          height: 896,
          color: "#f2f2f7",
          borderRadius: "35px",
          notch: "none",
        },
        "iphone-x": {
          name: "iPhone X",
          width: 375,
          height: 812,
          color: "#1d1d1f",
          borderRadius: "38px",
          notch: "standard",
        },
        "iphone-se": {
          name: "iPhone SE",
          width: 375,
          height: 667,
          color: "#ffffff",
          borderRadius: "30px",
          notch: "none",
        },
        standard: {
          name: "Standard (375×812)",
          width: 375,
          height: 812,
          color: "#000000",
          borderRadius: "40px",
          notch: "standard",
        },
      };

      // Initialize zoom level and phone model
      let zoomLevel = 1;
      let currentPhoneModel = "iphone-14-pro";

      // Function to update phone frame dimensions and styling
      function updatePhoneFrame(modelKey) {
        const model = phoneModels[modelKey];
        const iphoneScreen = document.getElementById("iphoneScreen");
        const iphoneFrame = document.getElementById("iphoneFrame");
        const phoneInfo = document.getElementById("phoneInfo");
        const iphoneNotch = iphoneScreen?.querySelector(".iphone-notch");
        const iframe = iphoneScreen?.querySelector("iframe");

        if (iphoneScreen && model) {
          // Update dimensions
          iphoneScreen.style.width = model.width + "px";
          iphoneScreen.style.height = model.height + "px";
          iphoneScreen.style.borderRadius = model.borderRadius;

          // Apply model-specific background gradient
          if (modelKey === "iphone-14-pro" || modelKey === "iphone-14") {
            iphoneScreen.style.background =
              "linear-gradient(135deg, #1a1a1c 0%, #1d1d1f 50%, #1a1a1c 100%)";
            iphoneScreen.style.padding = "4px";
          } else if (modelKey === "iphone-13-pro") {
            iphoneScreen.style.background =
              "linear-gradient(135deg, #2a2a2c 0%, #2c2c2e 50%, #2a2a2c 100%)";
            iphoneScreen.style.padding = "3px";
          } else if (modelKey === "iphone-13" || modelKey === "iphone-se") {
            iphoneScreen.style.background =
              "linear-gradient(135deg, #f8f8f8 0%, #ffffff 50%, #f8f8f8 100%)";
            iphoneScreen.style.padding =
              modelKey === "iphone-se" ? "2px" : "3px";
          } else if (modelKey === "iphone-11") {
            iphoneScreen.style.background =
              "linear-gradient(135deg, #f0f0f4 0%, #f2f2f7 50%, #f0f0f4 100%)";
            iphoneScreen.style.padding = "3px";
          } else {
            iphoneScreen.style.background = model.color;
            iphoneScreen.style.padding = "3px";
          }

          // Calculate iframe border-radius based on model (more accurate)
          const borderRadiusValue = parseInt(model.borderRadius);
          let iframeBorderRadius;
          if (modelKey === "iphone-14-pro" || modelKey === "iphone-14") {
            iframeBorderRadius = borderRadiusValue - 4 + "px"; // 43px
          } else if (modelKey === "iphone-13-pro" || modelKey === "iphone-13") {
            iframeBorderRadius = borderRadiusValue - 6 + "px"; // 39px
          } else if (modelKey === "iphone-12-pro" || modelKey === "iphone-12") {
            iframeBorderRadius = borderRadiusValue - 6 + "px"; // 36px
          } else if (modelKey === "iphone-11-pro" || modelKey === "iphone-x") {
            iframeBorderRadius = borderRadiusValue - 6 + "px"; // 32px
          } else if (modelKey === "iphone-11") {
            iframeBorderRadius = borderRadiusValue - 6 + "px"; // 29px
          } else if (modelKey === "iphone-se") {
            iframeBorderRadius = borderRadiusValue - 4 + "px"; // 26px
          } else {
            iframeBorderRadius = Math.max(borderRadiusValue - 8, 20) + "px";
          }

          if (iframe) {
            iframe.style.borderRadius = iframeBorderRadius;
          }

          // Update notch visibility and style
          if (iphoneNotch) {
            if (model.notch === "none") {
              iphoneNotch.style.display = "none";
            } else {
              iphoneNotch.style.display = "block";
              if (model.notch === "dynamic") {
                // Dynamic Island style (iPhone 14 Pro) - more realistic
                iphoneNotch.style.width = "126px";
                iphoneNotch.style.height = "37px";
                iphoneNotch.style.borderRadius = "19px";
                iphoneNotch.style.background = model.color;
                iphoneNotch.style.boxShadow =
                  "0 2px 8px rgba(0, 0, 0, 0.4), " +
                  "inset 0 1px 2px rgba(255, 255, 255, 0.1), " +
                  "inset 0 -1px 1px rgba(0, 0, 0, 0.2)";
                iphoneNotch.style.top = "8px";
              } else {
                // Standard notch style - more realistic
                iphoneNotch.style.width = "150px";
                iphoneNotch.style.height = "30px";
                iphoneNotch.style.borderRadius = "0 0 20px 20px";
                iphoneNotch.style.background = model.color;
                iphoneNotch.style.boxShadow =
                  "0 2px 6px rgba(0, 0, 0, 0.35), " +
                  "inset 0 1px 2px rgba(255, 255, 255, 0.08), " +
                  "inset 0 -1px 1px rgba(0, 0, 0, 0.15)";
                iphoneNotch.style.top = "0";
              }
            }
          }

          // Update frame class for additional styling
          if (iphoneFrame) {
            iphoneFrame.className =
              "iphone-frame iphone-" + modelKey.replace(/\s+/g, "-");
          }

          if (phoneInfo) {
            phoneInfo.innerHTML = `
            <span>${model.width} × ${model.height}px</span>
            <span class="mobile-badge">${model.name}</span>
          `;
          }
        }
      }

      paywallPreview.innerHTML = `
      <div class="iphone-frame-container">
        <div class="preview-controls">
          <div class="phone-selector-group">
            <label for="phoneModel" class="phone-selector-label">Phone Model:</label>
            <select id="phoneModel" class="phone-selector">
              ${Object.entries(phoneModels)
                .map(
                  ([key, model]) =>
                    `<option value="${key}" ${
                      key === currentPhoneModel ? "selected" : ""
                    }>${model.name} (${model.width}×${model.height})</option>`
                )
                .join("")}
            </select>
          </div>
          <div class="zoom-controls">
            <button class="zoom-btn" id="zoomOut" title="Zoom Out">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
            </button>
            <span class="zoom-level" id="zoomLevel">100%</span>
            <button class="zoom-btn" id="zoomIn" title="Zoom In">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="11" y1="8" x2="11" y2="14"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
            </button>
          </div>
        </div>
        <div class="iphone-frame-wrapper" id="iphoneFrameWrapper">
          <div class="iphone-frame iphone-iphone-14-pro" id="iphoneFrame">
            <div class="iphone-screen" id="iphoneScreen" style="background: linear-gradient(135deg, #1a1a1c 0%, #1d1d1f 50%, #1a1a1c 100%); border-radius: 47px; padding: 4px;">
              <div class="iphone-notch" style="width: 126px; height: 37px; border-radius: 19px; background: #1d1d1f; top: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.1), inset 0 -1px 1px rgba(0, 0, 0, 0.2);"></div>
              <iframe src="${url}" style="width: 100%; height: 100%; border: none; overflow: auto; display: block; border-radius: 43px;"></iframe>
            </div>
            <div class="iphone-info" id="phoneInfo">
          <span>${width} × ${height}px</span>
          <span class="mobile-badge">Mobile</span>
            </div>
          </div>
        </div>
      </div>
    `;

      // Add phone model selector functionality
      const phoneModelSelect = document.getElementById("phoneModel");
      if (phoneModelSelect) {
        phoneModelSelect.addEventListener("change", (e) => {
          currentPhoneModel = e.target.value;
          updatePhoneFrame(currentPhoneModel);
        });
      }

      // Initialize phone frame with default model
      updatePhoneFrame(currentPhoneModel);

      // Add zoom functionality
      const zoomInBtn = document.getElementById("zoomIn");
      const zoomOutBtn = document.getElementById("zoomOut");
      const zoomLevelDisplay = document.getElementById("zoomLevel");
      const iphoneFrame = document.getElementById("iphoneFrame");

      function updateZoom() {
        iphoneFrame.style.transform = `scale(${zoomLevel})`;
        iphoneFrame.style.transformOrigin = "center center";
        zoomLevelDisplay.textContent = Math.round(zoomLevel * 100) + "%";

        // Enable/disable buttons at limits
        zoomInBtn.disabled = zoomLevel >= 2;
        zoomOutBtn.disabled = zoomLevel <= 0.5;
      }

      zoomInBtn.addEventListener("click", () => {
        if (zoomLevel < 2) {
          zoomLevel = Math.min(zoomLevel + 0.05, 2);
          updateZoom();
        }
      });

      zoomOutBtn.addEventListener("click", () => {
        if (zoomLevel > 0.5) {
          zoomLevel = Math.max(zoomLevel - 0.05, 0.5);
          updateZoom();
        }
      });

      // Initialize zoom
      updateZoom();
    } else {
      // Display normally for desktop paywalls - full width below
      previewSection.classList.add("desktop-preview");
      previewSection.classList.remove("mobile-preview");
      contentWrapper.classList.remove("has-mobile-preview");

      paywallPreview.innerHTML = `
      <div class="desktop-preview">
        <div class="preview-info">
          <span>${width} × ${height}px</span>
          <span class="desktop-badge">Desktop</span>
        </div>
        <iframe src="${url}" style="width: 100%; min-height: 600px; border: none;"></iframe>
      </div>
    `;
    }
  }

  function setLoading(loading) {
    const loader = document.getElementById("generationLoader");
    const activeBtn = generateBtn || generateFigmaBtn;

    if (activeBtn) {
      const btnText = activeBtn.querySelector(".btn-text");
      const btnLoader = activeBtn.querySelector(".btn-loader");

      if (loading) {
        activeBtn.disabled = true;
        if (btnText) btnText.style.display = "none";
        if (btnLoader) btnLoader.style.display = "flex";

        // Show blurred loading animation
        if (loader) {
          loader.style.display = "flex";
        }
      } else {
        activeBtn.disabled = false;
        if (btnText) btnText.style.display = "flex";
        if (btnLoader) btnLoader.style.display = "none";

        // Hide blurred loading animation
        if (loader) {
          loader.style.display = "none";
        }
      }
    }
  }

  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = "block";
  }

  function hideError() {
    errorMessage.style.display = "none";
  }

  // Business Model Editor State
  let businessModelsData = [];

  // Business Model Editor Toggle
  if (toggleBusinessModel) {
    toggleBusinessModel.addEventListener("click", () => {
      const isOpen = businessModelEditor.style.display !== "none";
      businessModelEditor.style.display = isOpen ? "none" : "block";
      toggleBusinessModel.querySelector("svg").style.transform = isOpen
        ? "rotate(0deg)"
        : "rotate(180deg)";
    });
  }

  // Tab switching for business model editor
  const modelTabBtns = document.querySelectorAll(".model-tab-btn");
  const modelTabContents = document.querySelectorAll(".model-tab-content");

  modelTabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");

      // Update active tab button
      modelTabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      // Update active tab content
      modelTabContents.forEach((content) => {
        content.classList.remove("active");
        content.style.display = "none";
        if (content.id === `model-${targetTab}-tab`) {
          content.classList.add("active");
          content.style.display = "block";
        }
      });

      // If switching to JSON tab, sync from form
      if (targetTab === "json") {
        syncToJson();
      }
    });
  });

  // Sync form data to JSON
  function syncToJson() {
    if (!businessModelJson) return;

    const models = businessModelsData
      .map((model, modelIndex) => {
        const tiers = Array.from(
          document.querySelectorAll(`[data-model-index="${modelIndex}"]`)
        )
          .filter((el) => el.classList.contains("tier-card"))
          .map((tierCard, tierIndex) => {
            const tierName =
              tierCard.querySelector(`.tier-name-input`)?.value || "";
            const tierPrice =
              tierCard.querySelector(`.tier-price-input`)?.value || "";
            const tierFeaturesTextarea =
              tierCard.querySelector(`.tier-features-input`);
            const tierFeatures = tierFeaturesTextarea?.value
              ? tierFeaturesTextarea.value
                  .split("\n")
                  .map((f) => f.trim())
                  .filter((f) => f)
              : [];
            const tierValueProp =
              tierCard.querySelector(`.tier-value-prop-input`)?.value || "";

            return {
              name: tierName,
              price: tierPrice,
              features: tierFeatures,
              valueProposition: tierValueProp,
            };
          })
          .filter((tier) => tier.name || tier.price);

        return {
          type: model.type || "subscription",
          name: model.name || "Subscription Model",
          tiers: tiers,
          recommended: model.recommended || false,
        };
      })
      .filter((model) => model.tiers.length > 0);

    if (models.length > 0) {
      businessModelJson.value = JSON.stringify({ models }, null, 2);
    } else {
      businessModelJson.value = "";
    }
  }

  // Load JSON into form
  function loadFromJson() {
    const jsonText = businessModelJson?.value.trim();
    if (!jsonText) {
      businessModelError.textContent = "No JSON to load";
      businessModelError.style.display = "block";
      businessModelError.style.color = "var(--text-secondary)";
      return;
    }

    try {
      const parsed = JSON.parse(jsonText);
      if (parsed.models && Array.isArray(parsed.models)) {
        // Check if it's the simple format (each model is actually a tier)
        // Simple format: models have name, price, currency, period, description (no tiers array)
        // Complex format: models have name, type, tiers array
        const isSimpleFormat =
          parsed.models.length > 0 &&
          parsed.models[0].hasOwnProperty("price") &&
          (parsed.models[0].hasOwnProperty("currency") ||
            parsed.models[0].hasOwnProperty("period")) &&
          !parsed.models[0].hasOwnProperty("tiers");

        if (isSimpleFormat) {
          // Convert simple format to complex format
          // Group all tiers into a single subscription model
          const tiers = parsed.models.map((model) => {
            // Format price string from price, currency, and period
            let priceStr = "";
            if (model.currency && model.price !== undefined) {
              const currencySymbol =
                model.currency === "USD"
                  ? "$"
                  : model.currency === "EUR"
                  ? "€"
                  : model.currency === "GBP"
                  ? "£"
                  : model.currency;
              priceStr = `${currencySymbol}${model.price}`;
              if (model.period) {
                priceStr += `/${model.period}`;
              }
            } else if (model.price !== undefined) {
              priceStr = `$${model.price}`;
              if (model.period) {
                priceStr += `/${model.period}`;
              }
            }

            return {
              name: model.name || "",
              price:
                priceStr ||
                (model.price !== undefined ? `$${model.price}` : ""),
              features:
                model.features ||
                (model.description ? [model.description] : []),
              valueProposition:
                model.description || model.valueProposition || "",
            };
          });

          businessModelsData = [
            {
              name: "Subscription",
              type: "subscription",
              recommended: false,
              tiers: tiers,
            },
          ];
        } else {
          // Complex format - use as is, but ensure each model has tiers array
          businessModelsData = parsed.models.map((model) => ({
            name: model.name || "",
            type: model.type || "subscription",
            recommended: model.recommended || false,
            tiers: model.tiers || [],
          }));
        }

        renderBusinessModelForms();
        businessModelError.textContent = "✓ Loaded into form";
        businessModelError.style.display = "block";
        businessModelError.style.color = "#4ade80";

        // Switch to form tab
        const formTab = document.querySelector(
          '.model-tab-btn[data-tab="form"]'
        );
        if (formTab) formTab.click();
      } else {
        throw new Error("Missing 'models' array");
      }
    } catch (error) {
      businessModelError.textContent = `Invalid JSON: ${error.message}`;
      businessModelError.style.display = "block";
      businessModelError.style.color = "var(--error-text)";
    }
  }

  // Render business model forms
  function renderBusinessModelForms() {
    const container = document.getElementById("businessModelForms");
    if (!container) return;

    container.innerHTML = "";

    businessModelsData.forEach((model, modelIndex) => {
      const modelCard = createModelCard(model, modelIndex);
      container.appendChild(modelCard);
    });

    if (businessModelsData.length === 0) {
      container.innerHTML =
        '<p class="empty-message">No pricing models yet. Click "Add Pricing Model" to get started.</p>';
    }
  }

  // Create a model card
  function createModelCard(model, modelIndex) {
    const card = document.createElement("div");
    card.className = "model-card";
    card.setAttribute("data-model-index", modelIndex);

    card.innerHTML = `
    <div class="model-card-header">
      <div class="model-header-inputs">
        <input type="text" class="model-name-input" placeholder="Model Name (e.g., Premium Subscription)" 
               value="${model.name || ""}" data-model-index="${modelIndex}">
        <select class="model-type-select" data-model-index="${modelIndex}">
          <option value="subscription" ${
            model.type === "subscription" ? "selected" : ""
          }>Subscription</option>
          <option value="freemium" ${
            model.type === "freemium" ? "selected" : ""
          }>Freemium</option>
          <option value="one-time" ${
            model.type === "one-time" ? "selected" : ""
          }>One-Time Purchase</option>
        </select>
      </div>
      <div class="model-card-actions">
        <label class="recommended-toggle">
          <input type="checkbox" class="recommended-checkbox" ${
            model.recommended ? "checked" : ""
          } data-model-index="${modelIndex}">
          <span>Recommended</span>
        </label>
        <button type="button" class="remove-model-btn" data-model-index="${modelIndex}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
    <div class="tiers-container" data-model-index="${modelIndex}">
      ${(model.tiers || [])
        .map((tier, tierIndex) => createTierCard(tier, modelIndex, tierIndex))
        .join("")}
    </div>
    <button type="button" class="add-tier-btn" data-model-index="${modelIndex}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      Add Tier
    </button>
  `;

    // Add event listeners
    attachModelCardListeners(card, modelIndex);

    return card;
  }

  // Create a tier card
  function createTierCard(tier, modelIndex, tierIndex) {
    const features = (tier.features || []).join("\n");
    return `
    <div class="tier-card" data-model-index="${modelIndex}" data-tier-index="${tierIndex}">
      <div class="tier-header">
        <input type="text" class="tier-name-input" placeholder="Tier Name (e.g., Monthly, Annual)" 
               value="${
                 tier.name || ""
               }" data-model-index="${modelIndex}" data-tier-index="${tierIndex}">
        <button type="button" class="remove-tier-btn" data-model-index="${modelIndex}" data-tier-index="${tierIndex}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <input type="text" class="tier-price-input" placeholder="Price (e.g., $9.99/month, $79.99/year)" 
             value="${
               tier.price || ""
             }" data-model-index="${modelIndex}" data-tier-index="${tierIndex}">
      <textarea class="tier-features-input" placeholder="Features (one per line):&#10;Feature 1&#10;Feature 2&#10;Feature 3" 
                data-model-index="${modelIndex}" data-tier-index="${tierIndex}">${features}</textarea>
      <input type="text" class="tier-value-prop-input" placeholder="Value Proposition (e.g., Best value - save 33%)" 
             value="${
               tier.valueProposition || ""
             }" data-model-index="${modelIndex}" data-tier-index="${tierIndex}">
    </div>
  `;
  }

  // Attach event listeners to model card
  function attachModelCardListeners(card, modelIndex) {
    // Remove model button
    const removeBtn = card.querySelector(".remove-model-btn");
    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        businessModelsData.splice(modelIndex, 1);
        renderBusinessModelForms();
        syncToJson();
      });
    }

    // Update model data on input
    const nameInput = card.querySelector(".model-name-input");
    const typeSelect = card.querySelector(".model-type-select");
    const recommendedCheckbox = card.querySelector(".recommended-checkbox");

    [nameInput, typeSelect, recommendedCheckbox].forEach((el) => {
      if (el) {
        el.addEventListener("change", () => {
          if (businessModelsData[modelIndex]) {
            businessModelsData[modelIndex].name = nameInput?.value || "";
            businessModelsData[modelIndex].type =
              typeSelect?.value || "subscription";
            businessModelsData[modelIndex].recommended =
              recommendedCheckbox?.checked || false;
          }
          syncToJson();
        });
      }
    });

    // Add tier button
    const addTierBtn = card.querySelector(".add-tier-btn");
    if (addTierBtn) {
      addTierBtn.addEventListener("click", () => {
        if (!businessModelsData[modelIndex].tiers) {
          businessModelsData[modelIndex].tiers = [];
        }
        businessModelsData[modelIndex].tiers.push({
          name: "",
          price: "",
          features: [],
          valueProposition: "",
        });
        renderBusinessModelForms();
        syncToJson();
      });
    }

    // Remove tier buttons
    card.querySelectorAll(".remove-tier-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tierIndex = parseInt(btn.getAttribute("data-tier-index"));
        if (businessModelsData[modelIndex].tiers) {
          businessModelsData[modelIndex].tiers.splice(tierIndex, 1);
          renderBusinessModelForms();
          syncToJson();
        }
      });
    });

    // Update tier data on input
    card
      .querySelectorAll(
        ".tier-name-input, .tier-price-input, .tier-value-prop-input"
      )
      .forEach((input) => {
        input.addEventListener("input", () => {
          const tierIndex = parseInt(input.getAttribute("data-tier-index"));
          if (
            businessModelsData[modelIndex].tiers &&
            businessModelsData[modelIndex].tiers[tierIndex]
          ) {
            businessModelsData[modelIndex].tiers[tierIndex][
              input.classList.contains("tier-name-input")
                ? "name"
                : input.classList.contains("tier-price-input")
                ? "price"
                : "valueProposition"
            ] = input.value;
          }
          syncToJson();
        });
      });

    // Update features on input
    card.querySelectorAll(".tier-features-input").forEach((textarea) => {
      textarea.addEventListener("input", () => {
        const tierIndex = parseInt(textarea.getAttribute("data-tier-index"));
        if (
          businessModelsData[modelIndex].tiers &&
          businessModelsData[modelIndex].tiers[tierIndex]
        ) {
          businessModelsData[modelIndex].tiers[tierIndex].features =
            textarea.value
              .split("\n")
              .map((f) => f.trim())
              .filter((f) => f);
        }
        syncToJson();
      });
    });
  }

  // Add new business model
  if (document.getElementById("addBusinessModel")) {
    document
      .getElementById("addBusinessModel")
      .addEventListener("click", () => {
        businessModelsData.push({
          type: "subscription",
          name: "",
          tiers: [],
          recommended: false,
        });
        renderBusinessModelForms();
        syncToJson();
      });
  }

  // Validate JSON
  if (validateBusinessModel) {
    validateBusinessModel.addEventListener("click", () => {
      const jsonText = businessModelJson.value.trim();
      if (!jsonText) {
        businessModelError.textContent = "No JSON provided";
        businessModelError.style.display = "block";
        businessModelError.style.color = "var(--text-secondary)";
        return;
      }

      try {
        const parsed = JSON.parse(jsonText);
        if (parsed.models && Array.isArray(parsed.models)) {
          businessModelError.textContent = "✓ Valid JSON structure";
          businessModelError.style.display = "block";
          businessModelError.style.color = "#4ade80";
        } else {
          throw new Error("Missing 'models' array");
        }
      } catch (error) {
        businessModelError.textContent = `Invalid JSON: ${error.message}`;
        businessModelError.style.display = "block";
        businessModelError.style.color = "var(--error-text)";
      }
    });
  }

  // Sync from JSON to form
  if (document.getElementById("syncFromJson")) {
    document
      .getElementById("syncFromJson")
      .addEventListener("click", loadFromJson);
  }

  // Clear business model
  if (clearBusinessModel) {
    clearBusinessModel.addEventListener("click", () => {
      businessModelJson.value = "";
      businessModelsData = [];
      renderBusinessModelForms();
      businessModelError.style.display = "none";
    });
  }

  // Initialize empty form
  if (businessModelEditor && businessModelEditor.style.display !== "none") {
    renderBusinessModelForms();
  }

  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      if (!generatedCode) {
        showError("No paywall code to download");
        return;
      }

      // Create downloadable files
      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Paywall</title>
    <style>
        ${generatedCode.css || ""}
    </style>
</head>
<body>
    ${generatedCode.html || generatedCode}
    <script>
        ${generatedCode.js || ""}
    </script>
</body>
</html>`;

      // Download as HTML file
      const blob = new Blob([htmlContent], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "paywall.html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
}

// Custom dropdown enhancement for better styling
function initCustomDropdowns() {
  const selects = document.querySelectorAll(
    "select.figma-input, select.model-type-select, select.phone-selector"
  );

  selects.forEach((select) => {
    // Skip if already enhanced
    if (select.parentElement.classList.contains("custom-select-wrapper")) {
      return;
    }

    // Create wrapper
    const wrapper = document.createElement("div");
    wrapper.className = "custom-select-wrapper";

    // Create display element
    const display = document.createElement("div");
    display.className = "custom-select-display";

    // Create dropdown
    const dropdown = document.createElement("div");
    dropdown.className = "custom-select-dropdown";

    // Keyboard navigation state
    let highlightedIndex = -1;

    // Close dropdown function
    const closeDropdown = () => {
      wrapper.classList.remove("select-open");
      highlightedIndex = -1;
      dropdown.querySelectorAll(".custom-select-option").forEach((opt) => {
        opt.classList.remove("hover");
      });
    };

    // Populate dropdown with options
    Array.from(select.options).forEach((option, index) => {
      const optionElement = document.createElement("div");
      optionElement.className = "custom-select-option";
      optionElement.textContent = option.textContent;
      optionElement.dataset.value = option.value;
      if (option.selected) {
        optionElement.classList.add("selected");
        display.textContent = option.textContent;
      }

      optionElement.addEventListener("click", (e) => {
        e.stopPropagation();
        // Update select value
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));

        // Update display
        display.textContent = option.textContent;

        // Update selected state
        dropdown.querySelectorAll(".custom-select-option").forEach((opt) => {
          opt.classList.remove("selected");
        });
        optionElement.classList.add("selected");

        // Close dropdown
        closeDropdown();
      });

      dropdown.appendChild(optionElement);
    });

    // Wrap the select
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(display);
    wrapper.appendChild(dropdown);
    wrapper.appendChild(select);

    // Toggle dropdown
    display.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = wrapper.classList.contains("select-open");

      // Close all other dropdowns
      document.querySelectorAll(".custom-select-wrapper").forEach((w) => {
        w.classList.remove("select-open");
      });

      if (!isOpen) {
        wrapper.classList.add("select-open");
        // Focus the select for keyboard navigation
        select.focus();
      }
    });

    // Close on outside click
    document.addEventListener("click", (e) => {
      if (!wrapper.contains(e.target)) {
        closeDropdown();
      }
    });

    // Update display when select value changes programmatically
    select.addEventListener("change", () => {
      const selectedOption = select.options[select.selectedIndex];
      display.textContent = selectedOption.textContent;
      dropdown.querySelectorAll(".custom-select-option").forEach((opt) => {
        opt.classList.remove("selected");
        if (opt.dataset.value === select.value) {
          opt.classList.add("selected");
        }
      });
    });

    // Keyboard navigation
    select.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!wrapper.classList.contains("select-open")) {
          display.click();
        } else {
          // Select the highlighted option
          const options = Array.from(
            dropdown.querySelectorAll(".custom-select-option")
          );
          const indexToSelect =
            highlightedIndex >= 0
              ? highlightedIndex
              : options.findIndex((opt) => opt.classList.contains("selected"));
          if (indexToSelect >= 0 && options[indexToSelect]) {
            options[indexToSelect].click();
          }
        }
      } else if (e.key === "Escape") {
        closeDropdown();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const options = Array.from(
          dropdown.querySelectorAll(".custom-select-option")
        );

        if (!wrapper.classList.contains("select-open")) {
          wrapper.classList.add("select-open");
        }

        // Remove highlight from all options
        options.forEach((opt) => opt.classList.remove("hover"));

        // Determine which option to highlight
        if (highlightedIndex < 0) {
          highlightedIndex = options.findIndex((opt) =>
            opt.classList.contains("selected")
          );
          if (highlightedIndex < 0) highlightedIndex = 0;
        } else {
          if (e.key === "ArrowDown") {
            highlightedIndex =
              highlightedIndex < options.length - 1 ? highlightedIndex + 1 : 0;
          } else {
            highlightedIndex =
              highlightedIndex > 0 ? highlightedIndex - 1 : options.length - 1;
          }
        }

        // Highlight the option
        if (options[highlightedIndex]) {
          options[highlightedIndex].classList.add("hover");
          // Scroll into view
          options[highlightedIndex].scrollIntoView({ block: "nearest" });
        }
      }
    });

    // Make display focusable for accessibility
    display.setAttribute("tabindex", "0");
    display.setAttribute("role", "button");
    display.setAttribute("aria-haspopup", "listbox");
    display.setAttribute("aria-expanded", "false");

    display.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        display.click();
      }
    });

    // Update aria-expanded when dropdown opens/closes
    const updateAriaExpanded = () => {
      display.setAttribute(
        "aria-expanded",
        wrapper.classList.contains("select-open") ? "true" : "false"
      );
    };

    const observer = new MutationObserver(updateAriaExpanded);
    observer.observe(wrapper, { attributes: true, attributeFilter: ["class"] });
    updateAriaExpanded();
  });
}

// Initialize custom dropdowns when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCustomDropdowns);
} else {
  initCustomDropdowns();
}
