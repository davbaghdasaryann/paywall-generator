# Upload Paywalls for Style Analysis

This feature allows you to upload existing paywall HTML files to extract common design patterns. The system will analyze these paywalls and use the patterns to make newly generated paywalls more consistent in style.

## How It Works

1. **Upload paywalls**: Upload HTML files of existing paywalls
2. **Pattern extraction**: The system extracts common:
   - Colors (hex, rgb, rgba, hsl)
   - Font families
   - Spacing values (padding, margin)
   - Border radius values
   - Box shadows
   - Layout patterns (buttons, cards, containers)
3. **Style guidance**: When generating new paywalls from Figma, the AI uses these patterns to ensure consistency

## Usage

### Option 1: Command Line Script (Recommended)

Use the provided CLI script to upload paywalls:

```bash
# Upload a single paywall
node upload-paywall.js paywall1.html

# Upload multiple paywalls
node upload-paywall.js paywall1.html paywall2.html paywall3.html

# Upload all HTML files from a directory
node upload-paywall.js --directory ./paywalls

# View current patterns
node upload-paywall.js --patterns
```

### Option 2: Direct API Calls

#### Upload a single paywall:

```bash
curl -X POST http://localhost:3000/api/upload-paywall \
  -F "paywall=@path/to/paywall.html"
```

#### Upload multiple paywalls:

```bash
curl -X POST http://localhost:3000/api/upload-paywalls \
  -F "paywalls=@paywall1.html" \
  -F "paywalls=@paywall2.html" \
  -F "paywalls=@paywall3.html"
```

#### View current patterns:

```bash
curl http://localhost:3000/api/paywall-patterns
```

#### Clear all patterns:

```bash
curl -X DELETE http://localhost:3000/api/paywall-patterns
```

## Example Workflow

1. **Collect existing paywalls**: Gather HTML files of paywalls you want to match

   ```bash
   # Save paywalls to a directory
   mkdir paywalls
   # Copy your paywall HTML files here
   ```

2. **Upload them**:

   ```bash
   node upload-paywall.js --directory ./paywalls
   ```

3. **Check patterns**:

   ```bash
   node upload-paywall.js --patterns
   ```

4. **Generate new paywall**: When you generate a new paywall from Figma, it will automatically use these patterns for consistency

## What Gets Extracted

- **Colors**: All color values (background, text, borders)
- **Fonts**: Font families used throughout
- **Spacing**: Common padding and margin values
- **Border Radius**: Rounded corner values
- **Shadows**: Box shadow styles
- **Layouts**: Count of buttons, cards, containers

## Notes

- Patterns are stored in memory (reset when server restarts)
- The more paywalls you upload, the better the pattern matching
- Patterns are weighted - newer uploads have less impact than earlier ones
- The system keeps the most common values (top 20-30 of each type)

## API Endpoints

- `POST /api/upload-paywall` - Upload a single paywall HTML file
- `POST /api/upload-paywalls` - Upload multiple paywall HTML files (up to 20)
- `GET /api/paywall-patterns` - Get current extracted patterns
- `DELETE /api/paywall-patterns` - Clear all patterns
