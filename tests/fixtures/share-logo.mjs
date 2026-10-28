// DOM unit tests supply decoded image metadata; browser QA loads the real asset.
export function mockShareLogo(w){
 w.Image=class {
  naturalWidth=1760;naturalHeight=894;
  set src(value){this.url=value;queueMicrotask(()=>this.onload?.());}
 };
}
