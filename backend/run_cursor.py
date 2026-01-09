import os
import sys
import subprocess

# Default prompt content (used if prompt.txt doesn't exist)
DEFAULT_PROMPT = """You are a designer and frontend developer.

You are inside a folder that already contains:
- data.json (public company data)
- logo image
- post images

Use ONLY local files.
Do not fetch anything.

Analyze data.json and the images, then generate a modern website.

RULES:
- Use only facts found in data.json.
- You may generate descriptive text, but do NOT invent:
  phone numbers, emails, addresses, prices, dates, or statistics.
- If factual data is missing, simply omit it.

DESIGN:
- Take the main color palette from the logo.
- Support colors may come from post images.
- Reduce colors into a minimal, beautiful palette.
- Choose layout and style freely (do not reuse the same structure every time).
- Use icons, not emojis.
- Clean, modern, responsive design.

CONTENT:
- Decide sections yourself.
- Add extra meaningful content related to the company's industry.
- Keep tone natural and realistic (no hype).

LANGUAGES:
- Armenian (default), English, Russian.
- All text must exist in all three languages.
- Switch language with JavaScript.

OUTPUT:
- Create exactly 3 files:
  index.html
  styles.css
  script.js
- Use vanilla HTML, CSS, JS.
- Images must be referenced via relative paths.
- Output code only.
- Separate files with comments:
  /* ===== index.html ===== */
  /* ===== styles.css ===== */
  /* ===== script.js ===== */
"""

# Available models (common Cursor models)
AVAILABLE_MODELS = [
    "auto",              # Default - let Cursor choose
    "composer-1",        # Cursor's Composer 1 model
    "gpt-4",             # GPT-4
    "gpt-4-turbo",       # GPT-4 Turbo
    "gpt-5",             # GPT-5 (if available)
    "sonnet-4",          # Claude Sonnet 4
    "sonnet-4-thinking", # Claude Sonnet 4 Thinking
    "o1",                # OpenAI O1
    "o1-mini",           # OpenAI O1 Mini
]


def list_models():
    """List available models"""
    print("Available models:")
    print("=" * 60)
    for model in AVAILABLE_MODELS:
        default_marker = " (default)" if model == "auto" else ""
        print(f"  {model}{default_marker}")
    print("=" * 60)
    print("\nNote: Model availability depends on your Cursor subscription.")
    print("Use 'auto' to let Cursor automatically select the best model.")


def run_cursor_agent(folder_path, model="auto"):
    """
    Run cursor-agent in a subfolder with modified prompt
    
    Args:
        folder_path: Path to the data folder (e.g., 'barbar_ribs_lahmajoon')
        model: Model to use (default: 'auto')
    """
    
    # Verify folder exists
    if not os.path.exists(folder_path):
        raise ValueError(f"Folder does not exist: {folder_path}")
    
    # Verify data.json exists
    data_json_path = os.path.join(folder_path, "data.json")
    if not os.path.exists(data_json_path):
        raise ValueError(f"data.json not found in {folder_path}")
    
    # Read prompt - try prompt.txt first, fall back to default
    prompt_file = "prompt.txt"
    if os.path.exists(prompt_file):
        with open(prompt_file, 'r', encoding='utf-8') as f:
            prompt_content = f.read()
        print(f"✓ Read prompt from {prompt_file} ({len(prompt_content)} characters)")
    else:
        prompt_content = DEFAULT_PROMPT
        print(f"✓ Using default prompt ({len(prompt_content)} characters)")
    
    # Create cursor subdirectory with model name
    cursor_dir = os.path.join(folder_path, f"cursor-{model}")
    os.makedirs(cursor_dir, exist_ok=True)
    
    # Modify prompt to reference parent directory
    modified_prompt = prompt_content.replace(
        "You are inside a folder that already contains:",
        "IMPORTANT: All data files are in the PARENT directory (one level up).\n"
        "Use paths like ../data.json, ../logo.jpg, ../image1.jpg\n\n"
        "The parent directory contains:"
    ).replace(
        "- data.json (public company data)",
        "- ../data.json (public company data)"
    ).replace(
        "- logo image",
        "- ../logo.* (logo image file)"
    ).replace(
        "- post images",
        "- ../*.jpg (post images)"
    )
    
    # Save modified prompt for reference
    prompt_save_path = os.path.join(cursor_dir, "prompt_used.txt")
    with open(prompt_save_path, 'w', encoding='utf-8') as f:
        f.write(modified_prompt)
    print(f"✓ Saved modified prompt to {prompt_save_path}")
    
    # Change to cursor directory
    original_dir = os.getcwd()
    
    try:
        os.chdir(cursor_dir)
        print(f"\n✓ Changed directory to: {cursor_dir}")
        if model == "auto":
            print("Running cursor-agent (auto model selection)...\n")
        else:
            print(f"Running cursor-agent with model: {model}...\n")
        print("=" * 60)
        
        # Run cursor-agent with specified model (omit --model for auto)
        cmd = ["cursor-agent"]
        if model != "auto":
            cmd.extend(["--model", model])
        
        process = subprocess.run(
            cmd,
            input=modified_prompt,
            check=False,
            capture_output=False,
            text=True,
            encoding='utf-8'
        )
        
        print("=" * 60)
        
        if process.returncode == 0:
            print("\n✓ Cursor-agent completed successfully")
            print(f"✓ Output folder: {cursor_dir}")
        else:
            print(f"\n✗ Cursor-agent exited with code: {process.returncode}")
            return False
        
        return True
        
    except KeyboardInterrupt:
        print("\n\n⚠ Cursor-agent interrupted by user")
        return False
    except Exception as e:
        print(f"\n✗ Error running cursor-agent: {e}")
        return False
    finally:
        os.chdir(original_dir)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run_cursor.py <folder_path> [model]")
        print("\nExamples:")
        print("  python run_cursor.py barbar_ribs_lahmajoon")
        print("  python run_cursor.py barbar_ribs_lahmajoon composer-1")
        print("  python run_cursor.py barbar_ribs_lahmajoon sonnet-4")
        print("\nTo list available models:")
        print("  python run_cursor.py --list-models")
        sys.exit(1)
    
    # Check for list models command
    if sys.argv[1] == "--list-models" or sys.argv[1] == "-l":
        list_models()
        sys.exit(0)
    
    folder_path = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else "auto"
    
    # Validate model
    if model not in AVAILABLE_MODELS:
        print(f"⚠ Warning: '{model}' not in known models list.")
        print("It may still work if it's a valid Cursor model name.")
        print("Use 'python run_cursor.py --list-models' to see available models.\n")
    
    success = run_cursor_agent(folder_path, model)
    sys.exit(0 if success else 1)