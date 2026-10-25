"""Real rendered pixels must stay clear of short-video app chrome."""
import importlib.util
from pathlib import Path
from PIL import Image, ImageChops
spec=importlib.util.spec_from_file_location('renderer',Path(__file__).resolve().parents[1]/'scripts/cam_social_make_video.py')
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
for size in [(1200,630),(630,1200),(800,800)]:
    image=Image.new('RGB',size,'#073b83')
    image.paste('#f3ebdd',(size[0]//4,size[1]//4,size[0]*3//4,size[1]*3//4))
    for style in [r.cover,lambda i,t:r.promo_cover(i,t,'KICKER '*30),lambda i,t:r.brand_cover(i,t,'TAKES '*30)]:
        for title in ['Di lo que nadie se atreve a decir.','W'*200,'Un titular largo de fútbol y pronósticos '*20]:
            frame=style(image,title)
            bounds=ImageChops.difference(frame,Image.new('RGB',frame.size,frame.getpixel((0,0)))).getbbox()
            assert frame.size==(720,1280)
            assert bounds and bounds[0]>=72 and bounds[1]>=200 and bounds[2]<=588 and bounds[3]<=820,bounds
print('PASS: 27 rendered layouts stay inside the safe area, including long text and portrait images.')

for count in (1,3,8,20):
    selections=[f'Equipo {i} gana con más de 2.5 goles y ambos equipos anotan' for i in range(count)]
    job={'event_name':'FC Barcelona vs Real Madrid','selection':'\n'.join(selections),'american_odds':250}
    pages=r.pick_pages(image,job)
    assert len(pages)>=1
    for frame in pages:
        bounds=ImageChops.difference(frame,Image.new('RGB',frame.size,frame.getpixel((0,0)))).getbbox()
        assert bounds[0]>=72 and bounds[1]>=200 and bounds[2]<=588 and bounds[3]<=820,bounds
assert r.pick_lines('Equipo A gana\nMás de 2.5 | Ambos anotan')==['Equipo A gana','Más de 2.5','Ambos anotan']
draw=r.ImageDraw.Draw(image)
for text in ['W'*200,'Una selección larga con muchos espacios y goles '*20]:
    lines=r.full_wrap(draw,text,r.font(23,True))
    assert ''.join(''.join(lines).split())==''.join(text.split()),'Selection characters must never be truncated'
    assert all(draw.textlength(line,font=r.font(23,True))<=480 for line in lines)
print('PASS: actual-photo Pick layouts paginate all selections without truncation or unsafe pixels.')
