import { frameGroup, uniform, uniformArray } from 'three/tsl';

// Only for values independent of object and render camera. Shared groups avoid
// checking and uploading identical values for every mesh using the same shader.
export const frameUniform = (value, type) => uniform(value, type).setGroup(frameGroup);
export const frameUniformArray = (values, type) => uniformArray(values, type).setGroup(frameGroup);
