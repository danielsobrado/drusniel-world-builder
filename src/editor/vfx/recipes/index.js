import { blight, cureWounds } from './lifeRecipes.js';
import { acidSplash, acidSplashImpact, fogCloud, stinkingCloud } from './conjurationRecipes.js';
import { magicMissile, magicMissileImpact, shatter } from './arcaneRecipes.js';
import { fireball, fireballExplosion, meteorSwarm, wallOfFire } from './fireRecipes.js';
import { coneOfCold, iceStorm } from './frostRecipes.js';
import { moonbeam, sunbeam } from './radianceRecipes.js';
import { lightningBolt, thunderwave } from './stormRecipes.js';

/** Every recipe by id, including the impacts that projectiles spawn. */
export const EFFECT_RECIPES = Object.freeze({
  fireball,
  fireballExplosion,
  thunderwave,
  lightningBolt,
  coneOfCold,
  iceStorm,
  acidSplash,
  acidSplashImpact,
  magicMissile,
  magicMissileImpact,
  shatter,
  blight,
  cureWounds,
  fogCloud,
  stinkingCloud,
  wallOfFire,
  meteorSwarm,
  moonbeam,
  sunbeam,
});
