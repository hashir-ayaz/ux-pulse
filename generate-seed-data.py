#!/usr/bin/env python3
"""
Generate realistic seed data for UX Pulse — a Crumble e-commerce usability study.
Produces seed-data.csv with 20 participants across 5 persona types, 3 tasks each.
"""

import csv
import json
import random
import uuid
from datetime import datetime, timezone, timedelta

random.seed(42)

# ── Constants ──────────────────────────────────────────────────────────────────

OUTPUT_FILE = "/Users/mahamimran/ux-pulse/seed-data.csv"
BASE_TIMESTAMP_MS = 1774864800000  # 2026-03-30T10:00:00Z
PARTICIPANT_GAP_MS = 10 * 60 * 1000  # 10 minutes apart

CSV_HEADER = [
    "session_id", "study_id", "user_name", "user_email",
    "task_name", "task_number", "task_status", "session_duration_ms",
    "event_id", "event_type", "event_timestamp", "event_timestamp_readable",
    "event_url", "event_data",
]

URLS = {
    "home": "https://crumblelocal.com/",
    "menu": "https://crumblelocal.com/menu",
    "cart": "https://crumblelocal.com/cart",
    "checkout": "https://crumblelocal.com/checkout",
    "register": "https://crumblelocal.com/register",
    "signin": "https://crumblelocal.com/signin",
    "account": "https://crumblelocal.com/account",
}

TASKS = [
    {"name": "Register / Sign In", "number": 1},
    {"name": "Add to Cart & Checkout", "number": 2},
    {"name": "Contact Customer Support", "number": 3},
]

# ── Participants ───────────────────────────────────────────────────────────────

participants = [
    # Persona A: Tech-Savvy
    {"name": "Ahmed Raza", "email": "ahmed.raza@gmail.com", "persona": "A"},
    {"name": "Fatima Zahra", "email": "fatima.zahra@outlook.com", "persona": "A"},
    {"name": "Hamza Ali", "email": "hamza.ali@yahoo.com", "persona": "A"},
    {"name": "Ayesha Khan", "email": "ayesha.khan@gmail.com", "persona": "A"},
    # Persona B: Average
    {"name": "Bilal Hussain", "email": "bilal.hussain@gmail.com", "persona": "B"},
    {"name": "Sana Malik", "email": "sana.malik@hotmail.com", "persona": "B"},
    {"name": "Usman Tariq", "email": "usman.tariq@gmail.com", "persona": "B"},
    {"name": "Hira Noor", "email": "hira.noor@outlook.com", "persona": "B"},
    # Persona C: Struggling
    {"name": "Zubair Ahmed", "email": "zubair.ahmed@yahoo.com", "persona": "C"},
    {"name": "Nadia Bibi", "email": "nadia.bibi@gmail.com", "persona": "C"},
    {"name": "Rashid Mehmood", "email": "rashid.mehmood@hotmail.com", "persona": "C"},
    {"name": "Kiran Fatima", "email": "kiran.fatima@gmail.com", "persona": "C"},
    # Persona D: Cautious/Methodical
    {"name": "Saad Qureshi", "email": "saad.qureshi@gmail.com", "persona": "D"},
    {"name": "Maryam Iqbal", "email": "maryam.iqbal@outlook.com", "persona": "D"},
    {"name": "Farhan Sheikh", "email": "farhan.sheikh@yahoo.com", "persona": "D"},
    {"name": "Amna Riaz", "email": "amna.riaz@gmail.com", "persona": "D"},
    # Persona E: Impatient/Fast-clicker
    {"name": "Danish Aslam", "email": "danish.aslam@gmail.com", "persona": "E"},
    {"name": "Zara Siddiqui", "email": "zara.siddiqui@hotmail.com", "persona": "E"},
    {"name": "Owais Butt", "email": "owais.butt@yahoo.com", "persona": "E"},
    {"name": "Mahnoor Shah", "email": "mahnoor.shah@gmail.com", "persona": "E"},
]

# ── Persona profiles ──────────────────────────────────────────────────────────

PERSONA_PROFILES = {
    "A": {  # Tech-Savvy
        "time_gap_range": (200, 1500),
        "task1": {"complete_pct": 0.60, "duration_range": (30000, 60000),
                  "click": (3, 6), "form_focus": (2, 4), "form_error": (0, 1),
                  "hover_dwell": (1, 2), "idle_pause": (1, 2), "dead_click": (0, 0),
                  "rage_click": (0, 0), "modal_open": (1, 2), "api_pair": (1, 2),
                  "screenshot": (1, 2), "scroll": (0, 1), "page_navigate": (1, 1)},
        "task2": {"complete_pct": 1.00, "duration_range": (12000, 25000),
                  "click": (3, 5), "scroll": (3, 5), "scroll_reversal": (0, 0),
                  "hover_dwell": (1, 2), "idle_pause": (1, 1), "dead_click": (0, 0),
                  "modal_open": (2, 3), "api_pair": (3, 5), "hash_change": (0, 1),
                  "form_error": (0, 0), "screenshot": (2, 3), "page_navigate": (1, 2)},
        "task3": {"complete_pct": 1.00, "duration_range": (8000, 18000),
                  "click": (2, 4), "dead_click": (0, 1), "rage_click": (0, 0),
                  "hover_dwell": (1, 2), "idle_pause": (0, 1), "form_focus": (0, 1),
                  "iframe_interact": (0, 1), "modal_open": (1, 2), "screenshot": (1, 2)},
    },
    "B": {  # Average
        "time_gap_range": (400, 3000),
        "task1": {"complete_pct": 0.50, "duration_range": (50000, 100000),
                  "click": (5, 9), "form_focus": (3, 6), "form_error": (1, 3),
                  "hover_dwell": (2, 4), "idle_pause": (2, 4), "dead_click": (0, 2),
                  "rage_click": (0, 1), "modal_open": (1, 3), "api_pair": (2, 4),
                  "screenshot": (2, 4), "scroll": (1, 2), "page_navigate": (1, 2)},
        "task2": {"complete_pct": 0.75, "duration_range": (20000, 40000),
                  "click": (4, 7), "scroll": (4, 8), "scroll_reversal": (0, 2),
                  "hover_dwell": (2, 3), "idle_pause": (1, 3), "dead_click": (0, 1),
                  "modal_open": (2, 5), "api_pair": (4, 8), "hash_change": (0, 1),
                  "form_error": (0, 1), "screenshot": (2, 4), "page_navigate": (1, 2)},
        "task3": {"complete_pct": 1.00, "duration_range": (15000, 30000),
                  "click": (3, 6), "dead_click": (0, 2), "rage_click": (0, 1),
                  "hover_dwell": (2, 4), "idle_pause": (1, 3), "form_focus": (0, 2),
                  "iframe_interact": (0, 1), "modal_open": (1, 3), "screenshot": (1, 3)},
    },
    "C": {  # Struggling
        "time_gap_range": (500, 8000),
        "task1": {"complete_pct": 0.25, "duration_range": (80000, 150000),
                  "click": (8, 15), "form_focus": (4, 8), "form_error": (2, 5),
                  "hover_dwell": (4, 8), "idle_pause": (4, 8), "dead_click": (1, 4),
                  "rage_click": (1, 2), "modal_open": (2, 4), "api_pair": (3, 5),
                  "screenshot": (3, 6), "scroll": (1, 3), "page_navigate": (1, 2)},
        "task2": {"complete_pct": 0.50, "duration_range": (35000, 60000),
                  "click": (5, 10), "scroll": (6, 12), "scroll_reversal": (2, 4),
                  "hover_dwell": (3, 5), "idle_pause": (2, 4), "dead_click": (1, 3),
                  "modal_open": (3, 8), "api_pair": (5, 12), "hash_change": (1, 2),
                  "form_error": (1, 2), "screenshot": (3, 6), "page_navigate": (1, 2)},
        "task3": {"complete_pct": 0.75, "duration_range": (20000, 45000),
                  "click": (5, 10), "dead_click": (2, 5), "rage_click": (1, 3),
                  "hover_dwell": (3, 6), "idle_pause": (2, 4), "form_focus": (1, 2),
                  "iframe_interact": (1, 2), "modal_open": (2, 5), "screenshot": (2, 4)},
    },
    "D": {  # Cautious/Methodical
        "time_gap_range": (500, 5000),
        "task1": {"complete_pct": 0.75, "duration_range": (60000, 120000),
                  "click": (5, 10), "form_focus": (3, 7), "form_error": (0, 2),
                  "hover_dwell": (4, 8), "idle_pause": (3, 6), "dead_click": (0, 1),
                  "rage_click": (0, 0), "modal_open": (1, 3), "api_pair": (2, 4),
                  "screenshot": (2, 5), "scroll": (1, 2), "page_navigate": (1, 2)},
        "task2": {"complete_pct": 1.00, "duration_range": (25000, 45000),
                  "click": (4, 8), "scroll": (5, 10), "scroll_reversal": (1, 2),
                  "hover_dwell": (3, 5), "idle_pause": (2, 4), "dead_click": (0, 1),
                  "modal_open": (2, 6), "api_pair": (4, 10), "hash_change": (0, 1),
                  "form_error": (0, 1), "screenshot": (3, 5), "page_navigate": (1, 2)},
        "task3": {"complete_pct": 0.75, "duration_range": (18000, 35000),
                  "click": (3, 7), "dead_click": (0, 2), "rage_click": (0, 0),
                  "hover_dwell": (3, 6), "idle_pause": (2, 4), "form_focus": (1, 2),
                  "iframe_interact": (0, 1), "modal_open": (1, 4), "screenshot": (2, 4)},
    },
    "E": {  # Impatient/Fast-clicker
        "time_gap_range": (150, 1200),
        "task1": {"complete_pct": 0.50, "duration_range": (25000, 55000),
                  "click": (8, 15), "form_focus": (2, 5), "form_error": (1, 3),
                  "hover_dwell": (1, 2), "idle_pause": (1, 2), "dead_click": (1, 3),
                  "rage_click": (1, 2), "modal_open": (1, 3), "api_pair": (2, 4),
                  "screenshot": (1, 3), "scroll": (0, 2), "page_navigate": (1, 2)},
        "task2": {"complete_pct": 0.75, "duration_range": (10000, 20000),
                  "click": (5, 10), "scroll": (3, 6), "scroll_reversal": (0, 2),
                  "hover_dwell": (1, 2), "idle_pause": (1, 1), "dead_click": (1, 2),
                  "modal_open": (2, 5), "api_pair": (3, 8), "hash_change": (0, 2),
                  "form_error": (0, 1), "screenshot": (2, 3), "page_navigate": (1, 2)},
        "task3": {"complete_pct": 0.75, "duration_range": (6000, 15000),
                  "click": (4, 10), "dead_click": (1, 4), "rage_click": (1, 2),
                  "hover_dwell": (1, 2), "idle_pause": (0, 1), "form_focus": (0, 1),
                  "iframe_interact": (0, 1), "modal_open": (1, 3), "screenshot": (1, 2)},
    },
}

# ── Helpers ────────────────────────────────────────────────────────────────────

event_id_counter = 999  # will be incremented to 1000 on first use


def next_event_id():
    global event_id_counter
    event_id_counter += 1
    return event_id_counter


def ms_to_iso(ms):
    dt = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{int(ms % 1000):03d}Z"


def rand_range(lo, hi):
    return random.randint(lo, hi)


def decide_completion(pct):
    return "completed" if random.random() < pct else "skipped"


def csv_escape_json(d):
    """Return JSON string with CSV-safe double-quote escaping."""
    raw = json.dumps(d, separators=(",", ":"))
    return raw


# ── Event data generators ─────────────────────────────────────────────────────

REGISTER_FORM_FIELDS = [
    ("text", "firstName"), ("text", "lastName"), ("tel", "phone"),
    ("email", "email"), ("password", "password"),
]

REGISTER_CLICK_TARGETS = [
    ("BUTTON", "Sign Up", "btn-signup", "btn btn-primary", "true"),
    ("BUTTON", "Register", "btn-register", "btn btn-primary", "true"),
    ("INPUT", "", "input-phone", "form-control", "true"),
    ("INPUT", "", "input-email", "form-control", "true"),
    ("A", "Sign In", "link-signin", "nav-link", "true"),
    ("A", "Already have an account?", "link-existing", "text-link", "true"),
    ("BUTTON", "Submit", "btn-submit", "btn btn-success", "true"),
    ("INPUT", "", "input-password", "form-control", "true"),
    ("INPUT", "", "input-firstName", "form-control", "true"),
]

REGISTER_ERRORS = [
    "Phone number already exists",
    "Phone number already exists",  # intentionally doubled: this is the main bug
    "Phone number already exists",
    "Invalid phone number format",
    "Password must be at least 8 characters",
    "Email already registered",
]

REGISTER_API_URLS = [
    "https://crumblelocal.com/api/auth/register",
    "https://crumblelocal.com/api/auth/check-phone",
    "https://crumblelocal.com/api/auth/signin",
]

MENU_CLICK_TARGETS = [
    ("BUTTON", "Select Location", "btn-location", "location-selector", "true"),
    ("BUTTON", "Islamabad", "loc-islamabad", "location-option", "true"),
    ("DIV", "Cookies & Cream Shake", "product-shake", "product-card", "true"),
    ("BUTTON", "Add to Cart", "btn-add-cart", "btn btn-primary", "true"),
    ("BUTTON", "View Cart", "btn-view-cart", "btn btn-outline", "true"),
    ("BUTTON", "Checkout", "btn-checkout", "btn btn-success", "true"),
    ("A", "Menu", "nav-menu", "nav-link", "true"),
    ("SPAN", "Shakes", "cat-shakes", "category-pill", "true"),
    ("BUTTON", "+", "btn-qty-plus", "qty-btn", "true"),
    ("BUTTON", "Proceed to Checkout", "btn-proceed", "btn btn-primary", "true"),
]

MENU_API_URLS = [
    "https://crumblelocal.com/api/menu",
    "https://crumblelocal.com/api/menu/categories",
    "https://crumblelocal.com/api/cart/add",
    "https://crumblelocal.com/api/cart",
    "https://crumblelocal.com/api/locations",
    "https://crumblelocal.com/api/checkout/init",
    "https://crumblelocal.com/api/menu/products",
    "https://crumblelocal.com/api/cart/update",
]

MENU_ERRORS = [
    "Please select a location first",
    "Item out of stock",
]

SUPPORT_CLICK_TARGETS = [
    ("BUTTON", "Chat", "btn-chat", "chat-trigger", "true"),
    ("BUTTON", "Start Chat", "btn-start-chat", "btn btn-primary", "true"),
    ("BUTTON", "Send", "btn-send", "btn send-btn", "true"),
    ("DIV", "Help", "help-icon", "help-widget", "true"),
    ("BUTTON", "Contact Us", "btn-contact", "btn btn-outline", "true"),
    ("A", "Support", "nav-support", "nav-link", "true"),
    ("BUTTON", "Close", "btn-close-chat", "btn btn-close", "true"),
    ("INPUT", "", "chat-input", "form-control", "true"),
]

HOVER_TARGETS = [
    ("BUTTON", "Submit"), ("BUTTON", "Sign Up"), ("A", "Register"),
    ("BUTTON", "Add to Cart"), ("BUTTON", "Checkout"), ("BUTTON", "Chat"),
    ("DIV", "Cookies & Cream Shake"), ("BUTTON", "Send"), ("A", "Menu"),
    ("INPUT", "Phone"), ("INPUT", "Email"), ("BUTTON", "Select Location"),
]

SCREENSHOT_TRIGGERS = [
    "manual", "auto-interval", "dom-change", "task-boundary",
    "error-detected", "click-burst",
]


# ── URL helpers per task ──────────────────────────────────────────────────────

def task1_url_for_phase(progress_pct):
    """Return appropriate URL based on how far through task 1."""
    if progress_pct < 0.15:
        return URLS["home"]
    elif progress_pct < 0.90:
        return random.choice([URLS["register"], URLS["signin"]])
    else:
        return random.choice([URLS["register"], URLS["home"]])


def task2_url_for_phase(progress_pct):
    if progress_pct < 0.10:
        return URLS["home"]
    elif progress_pct < 0.50:
        return URLS["menu"]
    elif progress_pct < 0.80:
        return URLS["cart"]
    else:
        return URLS["checkout"]


def task3_url_for_phase(last_url):
    """Task 3 stays on the same page (usually checkout or homepage)."""
    return last_url


# ── Event generation ──────────────────────────────────────────────────────────

def gen_click_event(targets, url, timestamp):
    t = random.choice(targets)
    return {
        "type": "CLICK",
        "url": url,
        "data": {
            "x": random.randint(100, 1200),
            "y": random.randint(80, 700),
            "elementTag": t[0],
            "elementText": t[1],
            "elementId": t[2],
            "elementClasses": t[3],
            "isInteractive": t[4] == "true",
        },
    }


def gen_dead_click(url):
    return {
        "type": "DEAD_CLICK",
        "url": url,
        "data": {
            "x": random.randint(50, 1300),
            "y": random.randint(50, 800),
            "elementTag": "DIV",
            "elementText": "",
            "elementId": "",
            "elementClasses": random.choice(["container", "wrapper", "main-content", "page-body", "section-bg"]),
            "isInteractive": False,
        },
    }


def gen_rage_click(targets, url):
    t = random.choice(targets)
    return {
        "type": "RAGE_CLICK",
        "url": url,
        "data": {
            "x": random.randint(100, 1200),
            "y": random.randint(80, 700),
            "clickCount": random.randint(3, 7),
            "elementTag": t[0] if t[0] == "BUTTON" else "BUTTON",
            "elementText": t[1] if t[1] else "Submit",
            "isInteractive": True,
        },
    }


def gen_scroll(url, direction=None):
    d = direction or random.choice(["down", "down", "down", "up"])
    return {
        "type": "SCROLL",
        "url": url,
        "data": {
            "direction": d,
            "scrollY": random.randint(100, 3000),
            "scrollDepthPercent": random.randint(5, 95),
        },
    }


def gen_scroll_reversal(url):
    return {
        "type": "SCROLL_REVERSAL",
        "url": url,
        "data": {
            "fromDirection": "down",
            "toDirection": "up",
            "scrollY": random.randint(500, 2500),
        },
    }


def gen_hover_dwell(url):
    t = random.choice(HOVER_TARGETS)
    return {
        "type": "HOVER_DWELL",
        "url": url,
        "data": {
            "dwellMs": random.randint(1500, 5000),
            "elementTag": t[0],
            "elementText": t[1],
            "isInteractive": True,
        },
    }


def gen_idle_pause(url, current_ts):
    dur = random.randint(3000, 15000)
    return {
        "type": "IDLE_PAUSE",
        "url": url,
        "data": {
            "durationMs": dur,
            "startedAt": current_ts,
        },
    }


def gen_form_focus(fields, url):
    f = random.choice(fields)
    return {
        "type": "FORM_FOCUS",
        "url": url,
        "data": {
            "fieldType": f[0],
            "fieldName": f[1],
        },
    }


def gen_form_error(errors, url):
    return {
        "type": "FORM_ERROR",
        "url": url,
        "data": {
            "errorText": random.choice(errors),
        },
    }


def gen_modal_open(url):
    return {
        "type": "MODAL_OPEN",
        "url": url,
        "data": {
            "elementTag": "DIV",
            "role": "dialog",
            "ariaLabel": random.choice(["", "Location Picker", "Cart", "Chat Widget", "Registration"]),
        },
    }


def gen_api_pair(api_urls, url, is_error=False):
    req_id = str(uuid.uuid4())[:8]
    api_url = random.choice(api_urls)
    method = "POST" if ("add" in api_url or "register" in api_url or "signin" in api_url or "init" in api_url) else "GET"
    status = random.choice([400, 409, 422, 500]) if is_error else 200
    duration_ms = random.randint(80, 600)
    start_evt = {
        "type": "API_REQUEST_START",
        "url": url,
        "data": {
            "reqId": req_id,
            "method": method,
            "requestUrl": api_url,
        },
    }
    end_evt = {
        "type": "API_REQUEST_END",
        "url": url,
        "data": {
            "reqId": req_id,
            "method": method,
            "requestUrl": api_url,
            "statusCode": status,
            "durationMs": duration_ms,
        },
    }
    return start_evt, end_evt


def gen_screenshot(url):
    return {
        "type": "SCREENSHOT",
        "url": url,
        "data": {
            "trigger": random.choice(SCREENSHOT_TRIGGERS),
        },
    }


def gen_iframe_interact(url):
    return {
        "type": "IFRAME_INTERACT",
        "url": url,
        "data": {
            "iframeSrc": "https://democc.contegris.com:8443/widget/",
            "iframeTitle": "",
            "iframeName": "",
            "iframeId": "intellicon-chat-bot-iframe",
        },
    }


def gen_page_navigate(url):
    return {
        "type": "PAGE_NAVIGATE",
        "url": url,
        "data": {"transitionType": "link"},
    }


def gen_page_load(url):
    return {"type": "PAGE_LOAD", "url": url, "data": {}}


def gen_hash_change(url):
    return {"type": "HASH_CHANGE", "url": url, "data": {"transitionType": "link"}}


def gen_tab_switch(url):
    return {
        "type": "TAB_SWITCH",
        "url": url,
        "data": {"windowId": 1, "title": "Crumble"},
    }


def gen_page_hidden(url):
    return {"type": "PAGE_HIDDEN", "url": url, "data": {}}


def gen_page_visible(url):
    return {"type": "PAGE_VISIBLE", "url": url, "data": {}}


def gen_copy(url):
    return {"type": "COPY", "url": url, "data": {}}


def gen_paste(url):
    return {"type": "PASTE", "url": url, "data": {}}


# ── Build event sequence for a task ───────────────────────────────────────────

def build_task1_events(profile, persona, participant_idx):
    """Generate events for Task 1: Register / Sign In."""
    cfg = profile["task1"]
    events = []

    n_click = rand_range(*cfg["click"])
    n_form_focus = rand_range(*cfg["form_focus"])
    n_form_error = rand_range(*cfg["form_error"])
    n_hover = rand_range(*cfg["hover_dwell"])
    n_idle = rand_range(*cfg["idle_pause"])
    n_dead = rand_range(*cfg["dead_click"])
    n_rage = rand_range(*cfg["rage_click"])
    n_modal = rand_range(*cfg["modal_open"])
    n_api = rand_range(*cfg["api_pair"])
    n_screenshot = rand_range(*cfg["screenshot"])
    n_scroll = rand_range(*cfg["scroll"])
    n_page_nav = rand_range(*cfg["page_navigate"])

    # Build a pool of events, then shuffle and reorder
    pool = []
    for _ in range(n_page_nav):
        pool.append(("page_navigate", 0.05))
    pool.append(("page_load", 0.06))
    for _ in range(n_click):
        pool.append(("click", random.uniform(0.1, 0.9)))
    for _ in range(n_form_focus):
        pool.append(("form_focus", random.uniform(0.15, 0.85)))
    for _ in range(n_form_error):
        pool.append(("form_error", random.uniform(0.5, 0.9)))
    for _ in range(n_hover):
        pool.append(("hover_dwell", random.uniform(0.2, 0.85)))
    for _ in range(n_idle):
        pool.append(("idle_pause", random.uniform(0.2, 0.9)))
    for _ in range(n_dead):
        pool.append(("dead_click", random.uniform(0.3, 0.9)))
    for _ in range(n_rage):
        pool.append(("rage_click", random.uniform(0.6, 0.95)))
    for _ in range(n_modal):
        pool.append(("modal_open", random.uniform(0.1, 0.7)))
    for _ in range(n_screenshot):
        pool.append(("screenshot", random.uniform(0.1, 0.95)))
    for _ in range(n_scroll):
        pool.append(("scroll", random.uniform(0.15, 0.5)))

    # API pairs — some may be errors (especially the "phone already exists" bug)
    for i in range(n_api):
        is_err = (i >= n_api - n_form_error) if n_form_error > 0 else False
        phase = random.uniform(0.4, 0.9)
        pool.append(("api_start", phase))
        pool.append(("api_end", phase + 0.01))
        if is_err:
            pool[-2] = ("api_start_err", phase)
            pool[-1] = ("api_end_err", phase + 0.01)

    # Distraction events for some participants
    if participant_idx in (2, 7):  # Hamza Ali, Hira Noor get distracted
        pool.append(("tab_switch", 0.45))
        pool.append(("page_hidden", 0.46))
        pool.append(("page_visible", 0.55))

    # Copy/paste for struggling users copying error messages
    if persona == "C" and participant_idx in (8, 10):  # Zubair, Rashid
        pool.append(("copy", 0.75))
        pool.append(("paste", 0.78))

    # Sort by phase
    pool.sort(key=lambda x: x[1])

    api_pairs = {}
    api_err_pairs = {}
    api_idx = 0
    api_err_idx = 0

    for event_type, phase in pool:
        url = task1_url_for_phase(phase)
        if event_type == "click":
            events.append(gen_click_event(REGISTER_CLICK_TARGETS, url, None))
        elif event_type == "form_focus":
            events.append(gen_form_focus(REGISTER_FORM_FIELDS, url))
        elif event_type == "form_error":
            events.append(gen_form_error(REGISTER_ERRORS, url))
        elif event_type == "hover_dwell":
            events.append(gen_hover_dwell(url))
        elif event_type == "idle_pause":
            events.append(gen_idle_pause(url, 0))  # timestamp filled later
        elif event_type == "dead_click":
            events.append(gen_dead_click(url))
        elif event_type == "rage_click":
            events.append(gen_rage_click(REGISTER_CLICK_TARGETS, url))
        elif event_type == "modal_open":
            events.append(gen_modal_open(url))
        elif event_type == "screenshot":
            events.append(gen_screenshot(url))
        elif event_type == "scroll":
            events.append(gen_scroll(url))
        elif event_type == "page_navigate":
            events.append(gen_page_navigate(url))
        elif event_type == "page_load":
            events.append(gen_page_load(url))
        elif event_type == "api_start":
            start, end = gen_api_pair(REGISTER_API_URLS, url, is_error=False)
            api_pairs[api_idx] = end
            events.append(start)
            api_idx += 1
        elif event_type == "api_end":
            end = api_pairs.get(api_idx - 1)
            if end:
                events.append(end)
        elif event_type == "api_start_err":
            start, end = gen_api_pair(REGISTER_API_URLS, url, is_error=True)
            api_err_pairs[api_err_idx] = end
            events.append(start)
            api_err_idx += 1
        elif event_type == "api_end_err":
            end = api_err_pairs.get(api_err_idx - 1)
            if end:
                events.append(end)
        elif event_type == "tab_switch":
            events.append(gen_tab_switch(url))
        elif event_type == "page_hidden":
            events.append(gen_page_hidden(url))
        elif event_type == "page_visible":
            events.append(gen_page_visible(url))
        elif event_type == "copy":
            events.append(gen_copy(url))
        elif event_type == "paste":
            events.append(gen_paste(url))

    return events


def build_task2_events(profile, persona, participant_idx):
    """Generate events for Task 2: Add to Cart & Checkout."""
    cfg = profile["task2"]
    events = []

    n_click = rand_range(*cfg["click"])
    n_scroll = rand_range(*cfg["scroll"])
    n_scroll_rev = rand_range(*cfg["scroll_reversal"])
    n_hover = rand_range(*cfg["hover_dwell"])
    n_idle = rand_range(*cfg["idle_pause"])
    n_dead = rand_range(*cfg["dead_click"])
    n_modal = rand_range(*cfg["modal_open"])
    n_api = rand_range(*cfg["api_pair"])
    n_hash = rand_range(*cfg["hash_change"])
    n_form_error = rand_range(*cfg["form_error"])
    n_screenshot = rand_range(*cfg["screenshot"])
    n_page_nav = rand_range(*cfg["page_navigate"])

    pool = []
    for _ in range(n_page_nav):
        pool.append(("page_navigate", random.uniform(0.05, 0.3)))
    pool.append(("page_load", 0.06))
    for _ in range(n_click):
        pool.append(("click", random.uniform(0.1, 0.9)))
    for _ in range(n_scroll):
        pool.append(("scroll", random.uniform(0.15, 0.75)))
    for _ in range(n_scroll_rev):
        pool.append(("scroll_reversal", random.uniform(0.3, 0.7)))
    for _ in range(n_hover):
        pool.append(("hover_dwell", random.uniform(0.15, 0.8)))
    for _ in range(n_idle):
        pool.append(("idle_pause", random.uniform(0.2, 0.7)))
    for _ in range(n_dead):
        pool.append(("dead_click", random.uniform(0.2, 0.8)))
    for _ in range(n_modal):
        pool.append(("modal_open", random.uniform(0.1, 0.85)))
    for _ in range(n_screenshot):
        pool.append(("screenshot", random.uniform(0.1, 0.95)))
    for _ in range(n_hash):
        pool.append(("hash_change", random.uniform(0.3, 0.6)))
    for _ in range(n_form_error):
        pool.append(("form_error", random.uniform(0.1, 0.3)))

    for i in range(n_api):
        is_err = (i == 0 and n_form_error > 0)
        phase = random.uniform(0.15, 0.9)
        if is_err:
            pool.append(("api_start_err", phase))
            pool.append(("api_end_err", phase + 0.01))
        else:
            pool.append(("api_start", phase))
            pool.append(("api_end", phase + 0.01))

    # Distraction for some
    if participant_idx in (5, 15):  # Sana Malik, Amna Riaz
        pool.append(("tab_switch", 0.4))
        pool.append(("page_hidden", 0.41))
        pool.append(("page_visible", 0.50))

    pool.sort(key=lambda x: x[1])

    api_pairs = {}
    api_err_pairs = {}
    api_idx = 0
    api_err_idx = 0

    for event_type, phase in pool:
        url = task2_url_for_phase(phase)
        if event_type == "click":
            events.append(gen_click_event(MENU_CLICK_TARGETS, url, None))
        elif event_type == "scroll":
            events.append(gen_scroll(url))
        elif event_type == "scroll_reversal":
            events.append(gen_scroll_reversal(url))
        elif event_type == "hover_dwell":
            events.append(gen_hover_dwell(url))
        elif event_type == "idle_pause":
            events.append(gen_idle_pause(url, 0))
        elif event_type == "dead_click":
            events.append(gen_dead_click(url))
        elif event_type == "modal_open":
            events.append(gen_modal_open(url))
        elif event_type == "screenshot":
            events.append(gen_screenshot(url))
        elif event_type == "hash_change":
            events.append(gen_hash_change(url))
        elif event_type == "form_error":
            events.append(gen_form_error(MENU_ERRORS, url))
        elif event_type == "page_navigate":
            events.append(gen_page_navigate(url))
        elif event_type == "page_load":
            events.append(gen_page_load(url))
        elif event_type == "api_start":
            start, end = gen_api_pair(MENU_API_URLS, url, is_error=False)
            api_pairs[api_idx] = end
            events.append(start)
            api_idx += 1
        elif event_type == "api_end":
            end = api_pairs.get(api_idx - 1)
            if end:
                events.append(end)
        elif event_type == "api_start_err":
            start, end = gen_api_pair(MENU_API_URLS, url, is_error=True)
            api_err_pairs[api_err_idx] = end
            events.append(start)
            api_err_idx += 1
        elif event_type == "api_end_err":
            end = api_err_pairs.get(api_err_idx - 1)
            if end:
                events.append(end)
        elif event_type == "tab_switch":
            events.append(gen_tab_switch(url))
        elif event_type == "page_hidden":
            events.append(gen_page_hidden(url))
        elif event_type == "page_visible":
            events.append(gen_page_visible(url))

    return events


def build_task3_events(profile, persona, participant_idx, last_task2_url):
    """Generate events for Task 3: Contact Customer Support."""
    cfg = profile["task3"]
    events = []

    # Use the last URL from task 2 as the base
    base_url = last_task2_url if last_task2_url else URLS["checkout"]

    n_click = rand_range(*cfg["click"])
    n_dead = rand_range(*cfg["dead_click"])
    n_rage = rand_range(*cfg["rage_click"])
    n_hover = rand_range(*cfg["hover_dwell"])
    n_idle = rand_range(*cfg["idle_pause"])
    n_form_focus = rand_range(*cfg["form_focus"])
    n_iframe = rand_range(*cfg["iframe_interact"])
    n_modal = rand_range(*cfg["modal_open"])
    n_screenshot = rand_range(*cfg["screenshot"])

    pool = []
    for _ in range(n_click):
        pool.append(("click", random.uniform(0.1, 0.9)))
    for _ in range(n_dead):
        pool.append(("dead_click", random.uniform(0.1, 0.7)))
    for _ in range(n_rage):
        pool.append(("rage_click", random.uniform(0.4, 0.9)))
    for _ in range(n_hover):
        pool.append(("hover_dwell", random.uniform(0.1, 0.8)))
    for _ in range(n_idle):
        pool.append(("idle_pause", random.uniform(0.15, 0.7)))
    for _ in range(n_form_focus):
        pool.append(("form_focus", random.uniform(0.5, 0.9)))
    for _ in range(n_iframe):
        pool.append(("iframe_interact", random.uniform(0.4, 0.85)))
    for _ in range(n_modal):
        pool.append(("modal_open", random.uniform(0.2, 0.8)))
    for _ in range(n_screenshot):
        pool.append(("screenshot", random.uniform(0.1, 0.95)))

    # Distraction for some
    if participant_idx in (11, 18):  # Kiran Fatima, Owais Butt
        pool.append(("tab_switch", 0.35))
        pool.append(("page_hidden", 0.36))
        pool.append(("page_visible", 0.48))

    # Copy for a struggling user copying chat text
    if persona == "C" and participant_idx == 9:  # Nadia Bibi
        pool.append(("copy", 0.82))

    pool.sort(key=lambda x: x[1])

    chat_form_fields = [("text", "chatMessage"), ("text", "chatInput")]

    for event_type, phase in pool:
        url = task3_url_for_phase(base_url)
        if event_type == "click":
            events.append(gen_click_event(SUPPORT_CLICK_TARGETS, url, None))
        elif event_type == "dead_click":
            events.append(gen_dead_click(url))
        elif event_type == "rage_click":
            events.append(gen_rage_click(SUPPORT_CLICK_TARGETS, url))
        elif event_type == "hover_dwell":
            events.append(gen_hover_dwell(url))
        elif event_type == "idle_pause":
            events.append(gen_idle_pause(url, 0))
        elif event_type == "form_focus":
            events.append(gen_form_focus(chat_form_fields, url))
        elif event_type == "iframe_interact":
            events.append(gen_iframe_interact(url))
        elif event_type == "modal_open":
            events.append(gen_modal_open(url))
        elif event_type == "screenshot":
            events.append(gen_screenshot(url))
        elif event_type == "tab_switch":
            events.append(gen_tab_switch(url))
        elif event_type == "page_hidden":
            events.append(gen_page_hidden(url))
        elif event_type == "page_visible":
            events.append(gen_page_visible(url))
        elif event_type == "copy":
            events.append(gen_copy(url))

    return events


# ── Main generation loop ──────────────────────────────────────────────────────

def generate_all_data():
    global event_id_counter
    all_rows = []
    stats = {
        "total_events": 0,
        "total_sessions": 0,
        "completed": 0,
        "skipped": 0,
        "by_task": {1: {"completed": 0, "skipped": 0}, 2: {"completed": 0, "skipped": 0}, 3: {"completed": 0, "skipped": 0}},
        "by_persona": {},
        "event_types": {},
    }

    for p_idx, participant in enumerate(participants):
        persona = participant["persona"]
        profile = PERSONA_PROFILES[persona]
        study_id = str(uuid.uuid4())
        participant_base_ts = BASE_TIMESTAMP_MS + (p_idx * PARTICIPANT_GAP_MS)

        # Track the last URL from task 2 for task 3 context
        last_task2_url = URLS["checkout"]

        for task_idx, task in enumerate(TASKS):
            session_id = str(uuid.uuid4())
            task_num = task["number"]
            task_name = task["name"]

            # Determine completion status
            cfg_key = f"task{task_num}"
            cfg = profile[cfg_key]
            task_status = decide_completion(cfg["complete_pct"])

            stats["by_task"][task_num][task_status] += 1
            if task_status == "completed":
                stats["completed"] += 1
            else:
                stats["skipped"] += 1

            # Determine session duration
            dur_lo, dur_hi = cfg["duration_range"]
            session_duration_ms = random.randint(dur_lo, dur_hi)

            # Generate events
            if task_num == 1:
                events = build_task1_events(profile, persona, p_idx)
            elif task_num == 2:
                events = build_task2_events(profile, persona, p_idx)
            else:
                events = build_task3_events(profile, persona, p_idx, last_task2_url)

            # Calculate time budget
            # We need to fit all events within session_duration_ms
            total_events = len(events) + 2  # +2 for TASK_START and TASK_COMPLETE/SKIP
            time_gap_lo, time_gap_hi = profile["time_gap_range"]

            # Calculate timestamps
            current_ts = participant_base_ts + (task_idx * (session_duration_ms + random.randint(5000, 15000)))
            task_start_ts = current_ts

            # TASK_START event
            task_start_data = {"taskNumber": task_num, "taskName": task_name}
            task_start_url = URLS["home"]
            if task_num == 2:
                task_start_url = URLS["home"]
            elif task_num == 3:
                task_start_url = last_task2_url

            rows_for_session = []
            rows_for_session.append({
                "event_type": "TASK_START",
                "event_timestamp": current_ts,
                "event_url": task_start_url,
                "event_data": task_start_data,
            })

            # Distribute timestamps across events proportionally to fit
            # within the target session_duration_ms
            if len(events) > 0:
                # Generate random weights and normalize to fill the duration
                n_gaps = len(events) + 1  # gaps between events + final gap
                raw_weights = [random.uniform(0.5, 2.0) for _ in range(n_gaps)]
                weight_sum = sum(raw_weights)
                gaps = [int(w / weight_sum * session_duration_ms) for w in raw_weights]
                # Assign first N gaps to events, last gap is before TASK_COMPLETE/SKIP
                for i, evt in enumerate(events):
                    current_ts += gaps[i]

                    # Fix idle_pause startedAt
                    if evt["type"] == "IDLE_PAUSE":
                        evt["data"]["startedAt"] = current_ts

                    rows_for_session.append({
                        "event_type": evt["type"],
                        "event_timestamp": current_ts,
                        "event_url": evt["url"],
                        "event_data": evt["data"],
                    })
                # Use the last gap for the ending event
                current_ts += gaps[-1]
            else:
                current_ts += session_duration_ms

            actual_duration = current_ts - task_start_ts
            end_data = {"durationMs": actual_duration, "taskNumber": task_num}
            end_type = "TASK_COMPLETE" if task_status == "completed" else "TASK_SKIP"

            rows_for_session.append({
                "event_type": end_type,
                "event_timestamp": current_ts,
                "event_url": rows_for_session[-1]["event_url"] if rows_for_session else task_start_url,
                "event_data": end_data,
            })

            # Track last URL for task 3
            if task_num == 2:
                last_task2_url = rows_for_session[-1]["event_url"]

            # Convert to final CSV rows
            stats["total_sessions"] += 1
            for row_data in rows_for_session:
                eid = next_event_id()
                ts = row_data["event_timestamp"]
                stats["total_events"] += 1

                evt_type = row_data["event_type"]
                stats["event_types"][evt_type] = stats["event_types"].get(evt_type, 0) + 1

                persona_key = f"Persona {persona}"
                if persona_key not in stats["by_persona"]:
                    stats["by_persona"][persona_key] = 0
                stats["by_persona"][persona_key] += 1

                all_rows.append({
                    "session_id": session_id,
                    "study_id": study_id,
                    "user_name": participant["name"],
                    "user_email": participant["email"],
                    "task_name": task_name,
                    "task_number": task_num,
                    "task_status": task_status,
                    "session_duration_ms": actual_duration,
                    "event_id": eid,
                    "event_type": evt_type,
                    "event_timestamp": ts,
                    "event_timestamp_readable": ms_to_iso(ts),
                    "event_url": row_data["event_url"],
                    "event_data": json.dumps(row_data["event_data"], separators=(",", ":")),
                })

    return all_rows, stats


def write_csv(rows):
    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADER, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def print_summary(stats):
    print("=" * 70)
    print("  UX Pulse Seed Data Generation — Summary")
    print("=" * 70)
    print()
    print(f"  Output file:       {OUTPUT_FILE}")
    print(f"  Total participants: 20")
    print(f"  Total sessions:    {stats['total_sessions']}  (3 tasks x 20 participants)")
    print(f"  Total events:      {stats['total_events']}")
    print()
    print("  Task completion rates:")
    for t in (1, 2, 3):
        c = stats["by_task"][t]["completed"]
        s = stats["by_task"][t]["skipped"]
        total = c + s
        pct = (c / total * 100) if total > 0 else 0
        print(f"    Task {t}: {c}/{total} completed ({pct:.0f}%), {s} skipped")
    print()
    print(f"  Overall: {stats['completed']} completed, {stats['skipped']} skipped")
    print()
    print("  Events per persona group:")
    for p in sorted(stats["by_persona"]):
        print(f"    {p}: {stats['by_persona'][p]} events")
    print()
    print("  Event type distribution:")
    for evt_type in sorted(stats["event_types"], key=lambda x: -stats["event_types"][x]):
        print(f"    {evt_type:25s} {stats['event_types'][evt_type]:>5d}")
    print()
    print("=" * 70)
    print("  Done!")
    print("=" * 70)


if __name__ == "__main__":
    rows, stats = generate_all_data()
    write_csv(rows)
    print_summary(stats)
