/** Use the renderer's actual element: minimap/offscreen canvases can precede it. */
export async function captureWorldCanvas(page,file) {
 const handle=await page.evaluateHandle(()=>window.__editor.terrainView.renderer.domElement);
 try {
  const canvas=handle.asElement();
  if(!canvas||!await canvas.isVisible())throw new Error('Active world renderer canvas is not visible.');
  await canvas.screenshot({path:file});
 }finally{await handle.dispose();}
}
