"""
HTML email templates — branded as Vaaniq Voice.
All templates return a (subject, html) tuple.
Uses string .replace() to avoid conflicts with CSS curly braces.
"""

BRAND_COLOR = "#0B8A8F"
BRAND_NAME  = "Vaaniq"

# Placeholders that won't clash with CSS
_SUBJECT_PH      = "%%SUBJECT%%"
_CONTENT_PH      = "%%CONTENT%%"
_FRONTEND_URL_PH = "%%FRONTEND_URL%%"

_BASE = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{_SUBJECT_PH}</title>
  <style>
    body {{ margin:0; padding:0; background:#F9F9F8; font-family:'Helvetica Neue',Arial,sans-serif; color:#0F0F0E; }}
    .wrap {{ max-width:560px; margin:40px auto; background:#ffffff; border-radius:16px; border:1px solid #E8E8E6; overflow:hidden; }}
    .header {{ background:{BRAND_COLOR}; padding:32px 40px; text-align:center; }}
    .header-logo {{ display:inline-flex; align-items:center; gap:10px; }}
    .header-dot {{ width:36px; height:36px; background:rgba(255,255,255,0.2); border-radius:10px; display:inline-block; line-height:36px; text-align:center; font-size:20px; }}
    .header-name {{ color:#ffffff; font-size:22px; font-weight:700; letter-spacing:-0.5px; }}
    .body {{ padding:40px; }}
    .greeting {{ font-size:20px; font-weight:600; margin-bottom:12px; color:#0F0F0E; }}
    .text {{ font-size:15px; line-height:1.65; color:#52525F; margin-bottom:16px; }}
    .btn {{ display:inline-block; background:{BRAND_COLOR}; color:#ffffff !important; text-decoration:none; padding:12px 28px; border-radius:8px; font-size:14px; font-weight:600; margin:8px 0 24px; }}
    .divider {{ border:none; border-top:1px solid #F0F0EE; margin:28px 0; }}
    .feature-box {{ background:#F9F9F8; border:1px solid #E8E8E6; border-radius:12px; padding:20px 24px; margin:12px 0; }}
    .feature-title {{ font-size:14px; font-weight:600; color:#0F0F0E; margin-bottom:4px; }}
    .feature-desc {{ font-size:13px; color:#737370; line-height:1.5; margin:0; }}
    .badge {{ display:inline-block; background:#EDFAFA; color:{BRAND_COLOR}; font-size:11px; font-weight:600; padding:3px 10px; border-radius:99px; border:1px solid #D5F5F6; margin-bottom:6px; }}
    .footer {{ background:#F9F9F8; border-top:1px solid #F0F0EE; padding:24px 40px; text-align:center; }}
    .footer-text {{ font-size:12px; color:#A3A3A0; line-height:1.6; }}
    .footer-link {{ color:{BRAND_COLOR}; text-decoration:none; }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="header-logo">
        <span class="header-dot">&#9889;</span>
        <span class="header-name">{BRAND_NAME}</span>
      </div>
    </div>
    <div class="body">
      {_CONTENT_PH}
    </div>
    <div class="footer">
      <p class="footer-text">
        &copy; {BRAND_NAME} Voice &middot; AI-powered voice calling platform<br/>
        You are receiving this because you have an account with us.<br/>
        <a href="{_FRONTEND_URL_PH}/settings" class="footer-link">Manage email preferences</a>
      </p>
    </div>
  </div>
</body>
</html>"""


def _render(subject: str, content: str, frontend_url: str = "") -> tuple[str, str]:
    html = (
        _BASE
        .replace(_SUBJECT_PH, subject)
        .replace(_CONTENT_PH, content)
        .replace(_FRONTEND_URL_PH, frontend_url or "#")
    )
    return subject, html


# ── Password reset ────────────────────────────────────────────────────────────

def password_reset(user_email: str, reset_url: str, expires_minutes: int,
                   frontend_url: str = "") -> tuple[str, str]:
    content = f"""
    <p class="greeting">Reset your password &#128273;</p>
    <p class="text">
      We received a request to reset the password for <strong>{user_email}</strong>.
      Click the button below to choose a new password.
    </p>

    <a href="{reset_url}" class="btn">Reset Password &rarr;</a>

    <div class="feature-box">
      <p class="feature-desc">
        This link expires in <strong>{expires_minutes} minutes</strong> and can only be used once.
        If the button doesn&rsquo;t work, copy and paste this URL into your browser:
      </p>
      <p class="feature-desc" style="word-break:break-all;color:{BRAND_COLOR};margin-top:8px;">{reset_url}</p>
    </div>

    <hr class="divider" />
    <p class="text" style="font-size:13px;color:#A3A3A0;">
      If you didn&rsquo;t request a password reset, you can safely ignore this email &mdash;
      your password won&rsquo;t change.
    </p>
    """
    return _render(f"Reset your {BRAND_NAME} password", content, frontend_url)


# ── Welcome email ─────────────────────────────────────────────────────────────

def welcome(workspace_name: str, user_email: str, frontend_url: str = "") -> tuple[str, str]:
    content = f"""
    <p class="greeting">Welcome to {BRAND_NAME}, {workspace_name}! &#127881;</p>
    <p class="text">
      Your workspace is ready. Create AI voice agents, make calls, and start
      automating your outreach &mdash; all from one place.
    </p>

    <div class="feature-box">
      <div class="badge">Step 1</div>
      <p class="feature-title">Create your first agent</p>
      <p class="feature-desc">Give it a name, system prompt, voice, and language. Takes less than 2 minutes.</p>
    </div>
    <div class="feature-box">
      <div class="badge">Step 2</div>
      <p class="feature-title">Make your first call</p>
      <p class="feature-desc">Enter any phone number and let your AI agent handle the conversation in real-time.</p>
    </div>
    <div class="feature-box">
      <div class="badge">Step 3</div>
      <p class="feature-title">Review transcripts &amp; analytics</p>
      <p class="feature-desc">See what was said, sentiment scores, appointment bookings, and more.</p>
    </div>

    <hr class="divider" />
    <a href="{frontend_url or '#'}" class="btn">Go to Dashboard &rarr;</a>

    <p class="text" style="font-size:13px;color:#A3A3A0;">
      Signed up as <strong>{user_email}</strong>.
      Questions? Just reply to this email.
    </p>
    """
    return _render(f"Welcome to {BRAND_NAME} — your workspace is ready", content, frontend_url)


# ── Appointment confirmation ──────────────────────────────────────────────────

def appointment_confirmation(name: str, when_str: str, business_name: str = "",
                             notes: str = "", frontend_url: str = "") -> tuple[str, str]:
    biz = business_name or BRAND_NAME
    note_html = (
        f'<p class="feature-desc" style="margin-top:8px;">{notes}</p>' if notes else ""
    )
    content = f"""
    <p class="greeting">Your appointment is confirmed &#9989;</p>
    <p class="text">
      Hi {name or 'there'}, your appointment with <strong>{biz}</strong> has been scheduled.
      We look forward to speaking with you.
    </p>

    <div class="feature-box">
      <div class="badge">Appointment</div>
      <p class="feature-title">&#128197; {when_str}</p>
      {note_html}
    </div>

    <hr class="divider" />
    <p class="text" style="font-size:13px;color:#A3A3A0;">
      Need to reschedule or cancel? Just reply to this email or call us back &mdash; we&rsquo;re happy to help.
    </p>
    """
    return _render(f"Appointment confirmed — {when_str}", content, frontend_url)


# ── Feature announcement ──────────────────────────────────────────────────────

def announcement(subject: str, headline: str, body: str,
                 features: list | None = None,
                 cta_label: str = "", cta_url: str = "",
                 frontend_url: str = "") -> tuple[str, str]:
    features_html = ""
    for f in (features or []):
        title = f.get("title", "")
        desc  = f.get("description", "")
        features_html += f"""
        <div class="feature-box">
          <div class="badge">New</div>
          <p class="feature-title">{title}</p>
          <p class="feature-desc">{desc}</p>
        </div>"""

    cta_html = (
        f'<a href="{cta_url}" class="btn">{cta_label} &rarr;</a><br/>'
        if cta_label and cta_url else ""
    )
    divider = '<hr class="divider" />' if features_html else ""

    content = f"""
    <p class="greeting">{headline}</p>
    <p class="text">{body}</p>
    {features_html}
    {divider}
    {cta_html}
    """
    return _render(subject, content, frontend_url)


# ── Low credits alert ─────────────────────────────────────────────────────────

def low_credits(workspace_name: str, balance: float, frontend_url: str = "") -> tuple[str, str]:
    content = f"""
    <p class="greeting">&#9888;&#65039; Your credits are running low</p>
    <p class="text">
      Hi {workspace_name}, your {BRAND_NAME} account has
      <strong>{balance:.1f} minutes</strong> remaining.
      Top up now to keep your agents running without interruption.
    </p>
    <div class="feature-box" style="border-color:#FDE68A;background:#FFFBEB;">
      <p class="feature-title" style="color:#92400E;">Current balance: {balance:.1f} minutes</p>
      <p class="feature-desc">Calls will stop when your balance reaches 0.</p>
    </div>
    <hr class="divider" />
    <a href="{frontend_url or '#'}/billing" class="btn">Top Up Credits &rarr;</a>
    """
    return _render(f"Low credits alert — {balance:.1f} min remaining", content, frontend_url)


# ── Call summary ──────────────────────────────────────────────────────────────

def call_summary(phone: str, duration: int, sentiment: float | None,
                 summary: str, frontend_url: str = "") -> tuple[str, str]:
    sentiment_str = f"{sentiment * 100:.0f}%" if sentiment is not None else "N/A"
    mins, secs = divmod(duration, 60)
    duration_str = f"{mins}m {secs}s" if mins else f"{secs}s"
    summary_html = (
        f"<div class=\"feature-box\"><p class=\"feature-title\">Summary</p>"
        f"<p class=\"feature-desc\">{summary}</p></div>"
        if summary else ""
    )

    content = f"""
    <p class="greeting">&#128222; Call completed</p>
    <p class="text">A call to <strong>{phone}</strong> just finished. Here&rsquo;s a quick summary.</p>

    <div class="feature-box">
      <p class="feature-title">Duration</p>
      <p class="feature-desc">{duration_str}</p>
    </div>
    <div class="feature-box">
      <p class="feature-title">Sentiment</p>
      <p class="feature-desc">{sentiment_str} positivity</p>
    </div>
    {summary_html}

    <hr class="divider" />
    <a href="{frontend_url or '#'}/calls" class="btn">View Full Details &rarr;</a>
    """
    return _render(f"Call completed — {phone}", content, frontend_url)
