"""«Siempre serás bienvenido»: reabre la bienvenida desde el acceso.
Uso: python3 tests/welcome-again.py [--shots DIR]"""
import importlib.util, pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('full_page', HERE / 'full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
SEEN = "try{sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1','1')}catch(e){};"
USER = ("window.__fake.user={id:'11111111-1111-4111-8111-111111111111',email:'fan@cam.local',"
        "user_metadata:{username:'fan'},is_anonymous:false};")
OPEN = "document.getElementById('camWelcomeDialog').open"


def run():
    for dark in (False, True):
        for width in (390, 1280):
            name = ('noche' if dark else 'dia') + '-' + str(width)
            scale = 1 if width > 500 else 2
            # 1) Acceso: el botón está bajo la marca y la bienvenida se abre encima.
            with fp.full_page(fake_js=SEEN, dark=dark, width=width, scale=scale) as page:
                page.evaluate('openUserAuthModal()')
                page.evaluate('aeConfirmAuthIntro()')
                button = page.locator('#camAuthWelcomeAgain')
                assert button.is_visible() and button.inner_text().strip().lower() == 'siempre serás bienvenido'
                brand = page.locator('#userAuthModal .cam-auth-story-brand').bounding_box()
                assert button.bounding_box()['y'] > brand['y'] + brand['height'] - 1, 'debajo de CAM SPORTS'
                if SHOTS:
                    page.screenshot(path=f'{SHOTS}/bienvenido-acceso-{name}.png')
                button.click()
                page.wait_for_function(OPEN)
                page.locator('#camWelcomeClose').click()
                assert not page.evaluate(OPEN)
                assert page.evaluate("!document.getElementById('userAuthModal').classList.contains('hidden')"), 'la X vuelve al acceso'
                button.click()
                page.wait_for_function(OPEN)
                page.locator('[data-cam-welcome="picks"]').click()
                assert page.evaluate("document.getElementById('userAuthModal').classList.contains('hidden')"), 'ir a una sección cierra el acceso'
                assert not page.errors, page.errors
            # 2) Perfil propio: la cabecera solo muestra la X junto al rótulo.
            with fp.full_page(fake_js=SEEN + USER, dark=dark, width=width, scale=scale) as page:
                page.evaluate('window.openAeProfile()')
                header = page.locator('#aeProfileDialog .cam-profile-head')
                close = header.get_by_role('button', name='Cerrar perfil')
                close.wait_for(state='visible')
                assert not header.locator('[data-cam-welcome-again]').count()
                box = close.bounding_box()
                assert box['width'] >= 44 and box['height'] >= 44
                assert close.evaluate('(button) => button === document.activeElement'), 'el foco inicial sigue en la X'
                if SHOTS:
                    page.screenshot(path=f'{SHOTS}/perfil-cabecera-{name}.png')
                close.click()
                assert not page.evaluate("document.getElementById('aeProfileDialog').open")
                assert not page.errors, page.errors
    print('PASS: bienvenida en acceso y cabecera del perfil (día, noche, móvil y escritorio).')


if __name__ == '__main__':
    run()
