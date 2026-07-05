#!/usr/bin/env python3
"""
odp2reveal — convert a LibreOffice Impress .odp template into a standalone
reveal.js deck as EDITABLE structure (not a flattened background image):

  * vector decorations (blobs, waves, cards, lines) -> inline <svg> paths
  * photos / raster images                          -> <img> elements
  * text placeholders                               -> editable HTML (autofit)

Vector layer is produced by rendering a shapes-only copy of the deck
(text + images stripped) through LibreOffice -> PDF -> `pdftocairo -svg`,
which keeps every shape as a real SVG path. Photos and text come straight
from the ODP so they stay as first-class elements.

Output: reveal/<name>/index.html + reveal/<name>/media/*
Usage:  python3 odp2reveal.py <path-to.odp> [output-root]
"""
import sys, os, re, zipfile, subprocess, shutil, html
import xml.etree.ElementTree as ET
from collections import Counter

NS = {
 'office':'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
 'draw':'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
 'text':'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
 'presentation':'urn:oasis:names:tc:opendocument:xmlns:presentation:1.0',
 'svg':'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
 'style':'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
 'fo':'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
 'xlink':'http://www.w3.org/1999/xlink',
 'table':'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
}
def q(pfx,t): return '{%s}%s'%(NS[pfx],t)
for p,u in NS.items(): ET.register_namespace(p,u)

PXIN=96; CW,CH=1280,720

def inch(v):
    if v is None: return None
    m=re.match(r'(-?[\d.]+)\s*(in|cm|mm|pt)?',v)
    if not m: return None
    n=float(m.group(1)); u=m.group(2) or 'in'
    return {'in':n,'cm':n/2.54,'mm':n/25.4,'pt':n/72.0}[u]
def px(v):
    i=inch(v); return None if i is None else round(i*PXIN,1)
def esc(s): return html.escape(s, quote=True)

# ---------------------------------------------------------------- render shapes -> svg
def strip_to_shapes(src, dst):
    """copy of the odp with text placeholders AND image frames removed."""
    zin=zipfile.ZipFile(src)
    root=ET.fromstring(zin.read('content.xml'))
    def walk(parent):
        for ch in list(parent):
            if ch.tag==q('draw','frame') and (
               ch.find(q('draw','text-box')) is not None
               or ch.find(q('draw','image')) is not None
               or ch.find(q('table','table')) is not None):
                parent.remove(ch); continue
            for tb in ch.findall(q('draw','text-box')): ch.remove(tb)
            for tp in ch.findall(q('text','p')): ch.remove(tp)
            for tl in ch.findall(q('text','list')): ch.remove(tl)
            walk(ch)
    walk(root)
    data=ET.tostring(root, xml_declaration=True, encoding='UTF-8')
    with zipfile.ZipFile(dst,'w',zipfile.ZIP_DEFLATED) as zo:
        for it in zin.infolist():
            d=zin.read(it.filename)
            if it.filename=='content.xml': d=data
            zo.writestr(it, d, zipfile.ZIP_STORED if it.filename=='mimetype' else zipfile.ZIP_DEFLATED)

def render_svgs(src, work, stem, npages):
    work=os.path.abspath(work); os.makedirs(work, exist_ok=True)
    shapes=os.path.join(work, stem+'_shapes.odp')
    strip_to_shapes(src, shapes)
    prof='file://'+os.path.join(work,'prof_'+stem)
    subprocess.run(['soffice','--headless','--nolockcheck','--nodefault','--norestore',
        '-env:UserInstallation='+prof,'--convert-to','pdf','--outdir',work,shapes],
        check=True, capture_output=True, timeout=300)
    pdf=os.path.join(work, stem+'_shapes.pdf')
    svgs=[]
    for i in range(1,npages+1):
        out=os.path.join(work,'%s-%02d.svg'%(stem,i))
        subprocess.run(['pdftocairo','-svg','-f',str(i),'-l',str(i),pdf,out],
            check=True, capture_output=True, timeout=120)
        svgs.append(out)
    return svgs

def inline_svg(path, uid):
    """load an svg, namespace its ids (avoid cross-slide collisions), size to canvas."""
    s=open(path,encoding='utf-8').read()
    s=re.sub(r'<\?xml[^>]*\?>','',s)
    ids=set(re.findall(r'id="([^"]+)"',s))
    for x in sorted(ids,key=len,reverse=True):
        s=s.replace('id="%s"'%x,'id="%s_%s"'%(uid,x))
        s=s.replace('url(#%s)'%x,'url(#%s_%s)'%(uid,x))
        s=s.replace('href="#%s"'%x,'href="#%s_%s"'%(uid,x))
    # force canvas size, keep viewBox
    s=re.sub(r'(<svg\b[^>]*?)\swidth="[^"]*"\sheight="[^"]*"',
             r'\1 width="%d" height="%d"'%(CW,CH), s, count=1)
    s=s.replace('<svg ','<svg class="decor" preserveAspectRatio="none" ',1)
    return s.strip()

# ---------------------------------------------------------------- style resolve
def build_style_index(*roots):
    idx={}
    for root in roots:
        for st in root.iter(q('style','style')):
            n=st.get(q('style','name'))
            if not n: continue
            d=idx.setdefault(n,{}); d['parent']=st.get(q('style','parent-style-name'))
            tp=st.find(q('style','text-properties'))
            pp=st.find(q('style','paragraph-properties'))
            gp=st.find(q('style','graphic-properties'))
            if tp is not None:
                for k,a,nsx in (('size','font-size','fo'),('weight','font-weight','fo'),
                                ('style','font-style','fo'),('color','color','fo'),('font','font-name','style')):
                    v=tp.get(q(nsx,a));  d.setdefault(k,v) if v and k not in d else None
            if pp is not None:
                v=pp.get(q('fo','text-align'));  d.setdefault('align',v) if v else None
            if gp is not None:
                v=gp.get(q('draw','textarea-vertical-align'));  d.setdefault('valign',v) if v else None
            cp=st.find(q('style','table-cell-properties'))
            if cp is not None:
                v=cp.get(q('fo','background-color'));  d.setdefault('cellbg',v) if v else None
                v=cp.get(q('style','vertical-align'));  d.setdefault('cellvalign',v) if v else None
            colp=st.find(q('style','table-column-properties'))
            if colp is not None:
                v=colp.get(q('style','column-width'));  d.setdefault('colwidth',v) if v else None
    return idx
def resolve(idx,name,attr,depth=0):
    if not name or depth>8: return None
    d=idx.get(name)
    if not d: return None
    if d.get(attr): return d[attr]
    return resolve(idx,d.get('parent'),attr,depth+1)

def master_placeholders(styles_root):
    out={}
    for mp in styles_root.iter(q('style','master-page')):
        m=out.setdefault(mp.get(q('style','name')),{})
        for fr in mp.iter(q('draw','frame')):
            cls=fr.get(q('presentation','class'))
            if not cls: continue
            m.setdefault(cls,(px(fr.get(q('svg','x'))),px(fr.get(q('svg','y'))),
                              px(fr.get(q('svg','width'))),px(fr.get(q('svg','height')))))
    return out

# ---------------------------------------------------------------- elements
VALIGN={'top':'flex-start','middle':'center','bottom':'flex-end'}

def box_xywh(fr, cls, mbox):
    x=px(fr.get(q('svg','x'))); y=px(fr.get(q('svg','y')))
    w=px(fr.get(q('svg','width'))); h=px(fr.get(q('svg','height')))
    if (x is None or y is None) and cls in mbox and mbox[cls][0] is not None:
        mb=mbox[cls]
        x=x if x is not None else mb[0]; y=y if y is not None else mb[1]
        w=w or mb[2]; h=h or mb[3]
    return x,y,w,h

def img_html(fr, cls, mbox):
    im=fr.find(q('draw','image'))
    href=im.get(q('xlink','href')) if im is not None else None
    if not href: return None
    href=href.lstrip('./')
    x,y,w,h=box_xywh(fr,cls,mbox)
    if x is None or y is None: return None
    return ('  <img class="ph" src="%s" style="left:%gpx;top:%gpx;width:%gpx;height:%gpx">'
            %(esc(href),x,y,w or 100,h or 100))

def text_html(fr, cls, sidx, mbox):
    x,y,w,h=box_xywh(fr,cls,mbox)
    if x is None or y is None: return None
    w=w or 200; h=h or 60
    fstyle=fr.get(q('presentation','style-name')) or fr.get(q('draw','style-name'))
    run=par=None
    for sp in fr.iter(q('text','span')): run=sp.get(q('text','style-name')); break
    for pp in fr.iter(q('text','p')): par=pp.get(q('text','style-name')); break
    stl={}
    for nm in [n for n in (run,par,fstyle) if n]:
        for a in ('size','weight','style','color','align','font','valign'):
            if a not in stl:
                v=resolve(sidx,nm,a)
                if v: stl[a]=v
    is_list=fr.find('.//'+q('text','list')) is not None
    paras=[]
    for pp in fr.iter(q('text','p')):
        t=''.join(pp.itertext()).replace('​','').strip()
        if t: paras.append(t)
    if not paras: return None
    fs=px(stl.get('size')) or 24
    color=stl.get('color') or '#222'
    weight='700' if stl.get('weight')=='bold' else '400'
    italic='italic' if stl.get('style')=='italic' else 'normal'
    align={'start':'left','end':'right'}.get(stl.get('align'),stl.get('align') or 'left')
    valign=VALIGN.get(stl.get('valign') or 'top','flex-start')
    if is_list and len(paras)>1:
        inner='<ul>'+''.join('<li>%s</li>'%esc(p) for p in paras)+'</ul>'
    else:
        inner=''.join('<p>%s</p>'%esc(p) for p in paras)
    style=('left:%gpx;top:%gpx;width:%gpx;height:%gpx;font-size:%gpx;color:%s;'
           'font-weight:%s;font-style:%s;text-align:%s;align-items:%s;'
           %(x,y,w,h,fs,color,weight,italic,align,valign))
    return '  <div class="tb fit" style="%s"><div class="c">%s</div></div>'%(style,inner)

def table_html(fr, sidx, mbox):
    """Emit a real, positioned <table> from an ODP table:table frame with
    per-cell inline styles (bg, color, weight, italic, size, align, valign)."""
    tbl=fr.find(q('table','table'))
    if tbl is None: return None
    x,y,w,h=box_xywh(fr,'table',mbox)
    if x is None or y is None: return None
    w=w or 400; h=h or 200
    widths=[]
    for col in tbl.findall(q('table','table-column')):
        rep=int(col.get(q('table','number-columns-repeated')) or 1)
        widths += [inch(resolve(sidx, col.get(q('table','style-name')), 'colwidth')) or 1]*rep
    tot=sum(widths) or 1
    colgroup=''.join('<col style="width:%.2f%%">'%(wi/tot*100) for wi in widths)
    rows=[]
    for ri,row in enumerate(tbl.findall(q('table','table-row'))):
        cells=[]
        for cell in row.findall(q('table','table-cell')):
            csn=cell.get(q('table','style-name'))
            span=cell.get(q('table','number-columns-spanned'))
            p=cell.find(q('text','p')); psn=p.get(q('text','style-name')) if p is not None else None
            sp=cell.find('.//'+q('text','span')); spn=sp.get(q('text','style-name')) if sp is not None else None
            text=''.join(cell.itertext()).replace('​','').strip()
            st=[]
            bg=resolve(sidx,csn,'cellbg');            st.append('background-color:%s'%bg) if bg else None
            va=resolve(sidx,csn,'cellvalign');        st.append('vertical-align:%s'%va) if va else None
            color=resolve(sidx,spn,'color') or resolve(sidx,psn,'color'); st.append('color:%s'%color) if color else None
            if resolve(sidx,spn,'weight')=='bold':    st.append('font-weight:bold')
            if resolve(sidx,spn,'style')=='italic':   st.append('font-style:italic')
            size=resolve(sidx,spn,'size');            st.append('font-size:%gpx'%px(size)) if size else None
            align=resolve(sidx,psn,'align')
            if align in ('center','right','left'):    st.append('text-align:%s'%align)
            st.append('padding:8px')
            tag='th' if ri==0 else 'td'
            cells.append('<%s%s style="%s">%s</%s>'%(tag,' colspan="%s"'%span if span else '',';'.join(st),esc(text),tag))
        rows.append('<tr>%s</tr>'%''.join(cells))
    thead='<thead>%s</thead>'%rows[0] if rows else ''
    tbody='<tbody>%s</tbody>'%''.join(rows[1:]) if len(rows)>1 else ''
    style=('position:absolute;left:%gpx;top:%gpx;width:%gpx;height:%gpx;'
           'border-collapse:collapse;table-layout:fixed'%(x,y,w,h))
    return ('  <table class="re-table" style="%s"><colgroup>%s</colgroup>%s%s</table>'
            %(style,colgroup,thead,tbody))

# ---------------------------------------------------------------- main
def convert(src, outroot):
    stem=re.sub(r'^Presentation[_-]?','',os.path.splitext(os.path.basename(src))[0]).lower()
    outdir=os.path.join(outroot,stem)
    if os.path.isdir(os.path.join(outdir,'plates')): shutil.rmtree(os.path.join(outdir,'plates'))
    os.makedirs(outdir, exist_ok=True)
    work=os.path.join(outroot,'_work'); os.makedirs(work, exist_ok=True)

    zin=zipfile.ZipFile(src)
    croot=ET.fromstring(zin.read('content.xml'))
    sroot=ET.fromstring(zin.read('styles.xml'))
    sidx=build_style_index(croot,sroot); mbox_all=master_placeholders(sroot)
    pages=croot.findall('.//'+q('draw','page'))

    # extract raster media used by <img>
    media_out=os.path.join(outdir,'media'); os.makedirs(media_out, exist_ok=True)
    for it in zin.infolist():
        if it.filename.startswith('media/') or it.filename.startswith('Pictures/'):
            dst=os.path.join(outdir, it.filename)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst,'wb') as f: f.write(zin.read(it.filename))

    svgs=render_svgs(src, work, stem, len(pages))

    fonts=Counter()
    for st in croot.iter(q('style','style')):
        tp=st.find(q('style','text-properties'))
        if tp is not None and tp.get(q('style','font-name')): fonts[tp.get(q('style','font-name'))]+=1
    deckfont=fonts.most_common(1)[0][0] if fonts else 'Segoe UI'

    sections=[]
    for i,pg in enumerate(pages):
        mbox=mbox_all.get(pg.get(q('draw','master-page-name')),{})
        decor=inline_svg(svgs[i],'s%d'%(i+1))
        imgs, texts, tables=[],[],[]
        for fr in pg.findall(q('draw','frame')):
            cls=fr.get(q('presentation','class')) or 'body'
            # Table frames also carry a baked preview <image> — real table wins.
            if fr.find(q('table','table')) is not None:
                h=table_html(fr,sidx,mbox);  tables.append(h) if h else None
            elif fr.find(q('draw','image')) is not None:
                h=img_html(fr,cls,mbox);  imgs.append(h) if h else None
            elif fr.find(q('draw','text-box')) is not None:
                h=text_html(fr,cls,sidx,mbox);  texts.append(h) if h else None
        body='\n'.join([decor]+imgs+tables+texts)
        sections.append('<section>\n%s\n</section>'%body)

    doc=(TEMPLATE.replace('__TITLE__',esc(stem.capitalize()))
                 .replace('__FONT__',esc(deckfont))
                 .replace('__W__',str(CW)).replace('__H__',str(CH))
                 .replace('__SECTIONS__','\n\n'.join(sections)))
    open(os.path.join(outdir,'index.html'),'w').write(doc)
    print('  %-12s %2d slides -> %s'%(stem,len(pages),os.path.join(outdir,'index.html')))

TEMPLATE='''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__ — reveal.js reproduction</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reset.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css">
<style>
  .reveal{ font-family:"__FONT__","Segoe UI",system-ui,-apple-system,Arial,sans-serif; }
  .reveal .slides{ text-align:left; }
  .reveal .slides section{ padding:0; width:__W__px; height:__H__px; overflow:hidden; }
  .decor{ position:absolute; left:0; top:0; width:__W__px; height:__H__px; pointer-events:none; }
  .ph{ position:absolute; object-fit:cover; }
  .tb{ position:absolute; display:flex; overflow:hidden; line-height:1.2; }
  .tb>.c{ width:100%; }
  .tb ul{ margin:0; padding-left:1.05em; } .tb li{ margin:.12em 0; }
  .tb p{ margin:0 0 .2em 0; }
</style>
</head>
<body>
<div class="reveal"><div class="slides">
__SECTIONS__
</div></div>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.js"></script>
<script>
  function autofit(){
    document.querySelectorAll('.reveal .slides section .fit').forEach(function(tb){
      var c=tb.querySelector('.c'); if(!c) return;
      var fs=parseFloat(getComputedStyle(tb).fontSize), g=0;
      while((c.scrollHeight>tb.clientHeight+1||c.scrollWidth>tb.clientWidth+1)&&fs>7&&g++<200){
        fs-=1; tb.style.fontSize=fs+'px';
      }
    });
  }
  Reveal.initialize({width:__W__,height:__H__,margin:0,minScale:0.1,maxScale:2,
    center:false,hash:true,controls:true,progress:true,transition:'slide'});
  Reveal.on('ready',autofit); Reveal.on('resize',autofit);
</script>
</body>
</html>
'''

if __name__=='__main__':
    src=sys.argv[1]; outroot=sys.argv[2] if len(sys.argv)>2 else os.path.dirname(os.path.abspath(__file__))
    convert(src, outroot)
