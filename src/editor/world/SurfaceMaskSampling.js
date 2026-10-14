/** Bilinear read in cell coordinates, with texel centres at +0.5. */
export function sampleSurfaceMaskChannel(pixels,width,height,x,z,channel) {
 const u=Math.max(0,Math.min(width-1,x-.5)),v=Math.max(0,Math.min(height-1,z-.5));
 const x0=Math.floor(u),z0=Math.floor(v),x1=Math.min(width-1,x0+1),z1=Math.min(height-1,z0+1);
 const tx=u-x0,tz=v-z0,at=(a,b)=>pixels[(b*width+a)*4+channel];
 const north=at(x0,z0)+(at(x1,z0)-at(x0,z0))*tx,south=at(x0,z1)+(at(x1,z1)-at(x0,z1))*tx;
 return (north+(south-north)*tz)/255;
}
