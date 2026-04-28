import google.generativeai as genai
import fitz  # PyMuPDF
import os
import json
import re
import time
from PIL import Image
import io

# ── CONFIG ──────────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
PDF_ROOT       = "./pdfRoot"   # root folder, subfolders included
OUTPUT_FILE    = "well_data.json"
# ────────────────────────────────────────────────────────────────────────────

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-1.5-flash")

PROMPT = """
You are reading scanned oil and gas well documents from the Texas Railroad Commission.

Your job is to extract ONLY the following fields and return them as a single JSON object with NO extra text, markdown, or explanation:

{
  "api_number": <string or null>,
  "county": <string or null>,
  "salado": <true or false>,
  "yates": <true or false>
}

Rules:
- api_number: Look for "API #", "API Number", or a number like "045-00033" or "42-045-00033". Return it exactly as printed. If not found, return null.
- county: Look for "County" anywhere in the document. Return the county name only (e.g. "Briscoe"). If not found, return null.
- salado: Return true ONLY if the word "Salado" appears in a formation record, formation log, or geological description. Otherwise false.
- yates: Return true ONLY if the word "Yates" appears in a formation record, formation log, or geological description. Otherwise false.

Return ONLY the JSON object. No explanation. No markdown fences.
"""

def pdf_to_images(pdf_path, dpi=150):
    """Convert each page of a PDF to a PIL Image."""
    doc = fitz.open(pdf_path)
    images = []
    for page in doc:
        pix = page.get_pixmap(dpi=dpi)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        images.append(img)
    return images

def try_extract_api_from_filename(filename):
    """
    Try to pull an API number from the filename itself.
    Handles formats like: 045-00033.pdf, 42-045-00033.pdf, 04500033.pdf
    """
    name = os.path.splitext(filename)[0]
    match = re.search(r'(\d{2,3}-\d{5}|\d{7,10})', name)
    return match.group(0) if match else None

def try_extract_api_from_folder(folder_path):
    """Check if any parent folder name looks like an API number."""
    parts = folder_path.replace("\\", "/").split("/")
    for part in reversed(parts):
        match = re.search(r'(\d{2,3}-\d{5}|\d{7,10})', part)
        if match:
            return match.group(0)
    return None

def query_gemini(images):
    """Send all pages of a PDF to Gemini and get back structured JSON."""
    content = [PROMPT] + images
    try:
        response = model.generate_content(content)
        text = response.text.strip()
        # Strip any accidental markdown fences
        text = re.sub(r"^```json|^```|```$", "", text, flags=re.MULTILINE).strip()
        return json.loads(text)
    except json.JSONDecodeError:
        return {"error": "Gemini returned non-JSON", "raw": response.text}
    except Exception as e:
        return {"error": str(e)}


def merge_results(results):
    """
    Merge multiple entries for the same API number.
    'true' always wins over 'false', and non-null wins over null.
    """
    merged = {}

    for entry in results:
        api = entry.get("api_number")

        # If we couldn't determine an API number, keep the entry as-is
        if not api:
            api = f"UNKNOWN_{entry.get('source_file', 'file')}"

        if api not in merged:
            # First time seeing this API — create base entry
            merged[api] = {
                "api_number": api,
                "county": entry.get("county"),
                "salado": entry.get("salado", False),
                "yates": entry.get("yates", False),
                "source_files": [entry.get("source_file")],
                "errors": []
            }
        else:
            # Already seen this API — merge intelligently
            existing = merged[api]

            # true always wins over false
            if entry.get("salado"):
                existing["salado"] = True
            if entry.get("yates"):
                existing["yates"] = True

            # Non-null county wins over null
            if not existing["county"] and entry.get("county"):
                existing["county"] = entry.get("county")

            # Track all files that mentioned this well
            existing["source_files"].append(entry.get("source_file"))

            # Collect any errors for review
            if entry.get("error"):
                existing["errors"].append({
                    "file": entry.get("source_file"),
                    "error": entry.get("error")
                })

    # Clean up empty error lists
    for entry in merged.values():
        if not entry["errors"]:
            del entry["errors"]

    return list(merged.values())

def process_all_pdfs(root_folder):
    results = []
    pdf_files = []

    # Collect all PDFs recursively
    for dirpath, _, filenames in os.walk(root_folder):
        for fname in filenames:
            if fname.lower().endswith(".pdf"):
                pdf_files.append((dirpath, fname))

    print(f"Found {len(pdf_files)} PDFs to process...\n")

    for i, (dirpath, fname) in enumerate(pdf_files):
        full_path = os.path.join(dirpath, fname)
        print(f"[{i+1}/{len(pdf_files)}] Processing: {full_path}")

        # Try to get API from filename or folder before calling Gemini
        api_from_file   = try_extract_api_from_filename(fname)
        api_from_folder = try_extract_api_from_folder(dirpath)

        try:
            images = pdf_to_images(full_path)

            # Gemini flash has an image limit per request — chunk if needed
            # Send first 10 pages max (formation records are usually early)
            images = images[:10]

            data = query_gemini(images)

            # Prefer filename/folder API over Gemini's if Gemini missed it
            if not data.get("api_number"):
                data["api_number"] = api_from_file or api_from_folder

            data["source_file"] = full_path
            results.append(data)

        except Exception as e:
            results.append({
                "source_file": full_path,
                "api_number": api_from_file or api_from_folder,
                "error": str(e)
            })

        # Be polite to the API — avoid rate limiting
        time.sleep(1.5)

        # Save progress every 10 files in case of interruption
        if (i + 1) % 10 == 0:
            with open(OUTPUT_FILE, "w") as f:
                json.dump(results, f, indent=2)
            print(f"  → Progress saved ({i+1} files done)\n")

    # Final save - merged
    merged = merge_results(results)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(merged, f, indent=2)

    print(f"\nDone! {len(pdf_files)} PDFs -> {len(merged)} unique wells.")
    print(f" Wells Results saved to {OUTPUT_FILE}")
    return merged



if __name__ == "__main__":
    process_all_pdfs(PDF_ROOT)