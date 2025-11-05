/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function () {
  return foundry.applications.handlebars.loadTemplates([
    // Actor partials.
    'systems/flabbergasted/templates/actor/parts/actor-sceneCues.hbs',
    'systems/flabbergasted/templates/actor/parts/actor-traits.hbs',
    'systems/flabbergasted/templates/actor/parts/actor-description.hbs',
    'systems/flabbergasted/templates/actor/parts/actor-socialClub-description.hbs',
    'systems/flabbergasted/templates/actor/parts/actor-socialClub-members.hbs',
    'systems/flabbergasted/templates/actor/parts/actor-socialClub-upgrades.hbs',
    // Item partials
    'systems/flabbergasted/templates/item/parts/item-effects.hbs',
  ]);
};

export const rollTemplate = "systems/flabbergasted/templates/chat/roll.hbs";
export const sceneCueTemplate = "systems/flabbergasted/templates/chat/scene-cue.hbs";
export const clubUpgradeTemplate = "systems/flabbergasted/templates/chat/club-upgrade.hbs";
export const memberRolesDialogTemplate = "systems/flabbergasted/templates/dialog/members-roles.hbs";