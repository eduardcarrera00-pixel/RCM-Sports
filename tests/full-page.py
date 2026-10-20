"""Carga index.html completo (con todos sus scripts) sobre un servidor local,
cambiando Supabase por tests/fake-supabase.js y bloqueando la red externa.
Uso como módulo: with full_page(fake_js=..., dark=False) as page: ...
"""
import contextlib, functools, http.server, pathlib, threading
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
FAKE_CLIENT = (ROOT / 'tests/fake-supabase.js').read_text(encoding='utf8')


@contextlib.contextmanager
def _server():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    handler = functools.partial(Quiet, directory=str(ROOT))
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        yield f'http://127.0.0.1:{srv.server_address[1]}'
    finally:
        srv.shutdown()


@contextlib.contextmanager
def full_page(fake_js='', dark=False, width=390, height=900, scale=2):
    with _server() as base, sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=scale,
                                  color_scheme='dark' if dark else 'light')
        def route(r):
            url = r.request.url
            if 'supabase-js' in url:
                return r.fulfill(status=200, content_type='application/javascript', body=FAKE_CLIENT)
            if 'dompurify' in url:
                return r.fulfill(status=200, content_type='application/javascript',
                                 body='window.DOMPurify={sanitize:s=>String(s)};')
            if url.startswith(base):
                return r.continue_()
            return r.abort()
        ctx.route('**/*', route)
        ctx.add_init_script('window.__fake=window.__fake||{};' + fake_js)
        ctx.add_init_script("try{localStorage.setItem('rcm_sports_theme','%s')}catch(e){}" % ('dark' if dark else 'light'))
        page = ctx.new_page()
        page.errors = []
        page.on('pageerror', lambda e: page.errors.append(str(e)))
        page.goto(base + '/index.html', wait_until='load', timeout=60000)
        page.wait_for_timeout(1200)
        try:
            yield page
        finally:
            browser.close()
