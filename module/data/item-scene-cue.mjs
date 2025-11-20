import FlabbergastedItemBase from "./item-base.mjs";
import { DATA_COMMON } from "./common.mjs";
import { sceneCueTemplate } from "../helpers/templates.mjs";

export default class FlabbergastedSceneCue extends FlabbergastedItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    function isDocument(value) {
      const {id, collection, uuid} = foundry.utils.parseUuid(value) ?? {};
      if (!id || !collection) return false;
      console.error(uuid);
      return true;
    }

    schema.socialStanding = new fields.NumberField({ ...DATA_COMMON.requiredInteger, initial: 0, min: -1, max: 1 });
    schema.maxUsage = new fields.NumberField({ ...DATA_COMMON.requiredInteger, initial: 0, min: 0, max: 3 });
    schema.availableUsage = new fields.NumberField({ ...DATA_COMMON.requiredInteger, initial: 0, min: 0, max: 3 });
    schema.used = new fields.NumberField({ ...DATA_COMMON.requiredInteger, initial: 0, min: 0, max: 3 });

    schema.hasExtraItems = new fields.BooleanField({ initial: false });

    schema.extraItem = new fields.SchemaField({
      item1: new fields.StringField({ required: false, blank: true }),
      item2: new fields.StringField({ required: false, blank: true }),
      item3: new fields.StringField({ required: false, blank: true }),
    });

    // add "influence field"
    schema.influence = new fields.DocumentUUIDField({
      type: "RollTable",
      // validate: value => isDocument(value),
      validationError: `Type can only be '${this.TYPE}'.`,
    });

    return schema;
  }

  async prepareData(context) {
    let socialStandingOptions =
    {
      choices: {
        "-1": "Dignity",
        0: "No changes",
        1: "Scandal"
      },
      chosen: `${this.socialStanding}`
    };
    context.socialStandingOptions = socialStandingOptions;
  }

  async roll(actor, eventType) {
    const item = this.parent;
    let hasInflu = foundry.utils.parseUuid(item.system.influence);

    if (eventType == 1) {
      let value = Math.min(item.system.maxUsage, item.system.availableUsage + 1);
      return await item.update({ "system.availableUsage": value });
    }
    if (eventType == 2) {
      let value = Math.max(0, item.system.availableUsage - 1);
      let used = Math.min(item.system.used, value);
      return await item.update({ "system.availableUsage": value, "system.used": used });
    }

    if (this.used >= this.availableUsage)
      return;


    // Initialize chat data.
    const speaker = ChatMessage.getSpeaker({ actor: actor });
    const rollMode = game.settings.get('core', 'rollMode');

    await item.update({ "system.used": this.used + 1 });
    let newSocialStanding = null;
    let socialStandingText = null;
    if (this.socialStanding != 0) {
      newSocialStanding = Math.min(Math.max(actor.system.socialStanding + this.socialStanding, -10), 10);
      await actor.update({ "system.socialStanding": newSocialStanding });

      socialStandingText = 0;
      if (newSocialStanding < 0)
        socialStandingText = -1;
      else if (newSocialStanding > 0)
        socialStandingText = 1;
      socialStandingText = game.i18n.localize(`FLABBERGASTED.Item.SceneCue.SocialStandingChange.${socialStandingText}`);
    }

    const content = await foundry.applications.handlebars.renderTemplate(sceneCueTemplate, {
      sceneCue: item,
      newSocialStanding: Math.abs(newSocialStanding),
      socialStandingText
    });

    await ChatMessage.create({
      speaker: speaker,
      rollMode: rollMode,
      // flavor: content,
      content: content,
    });

    // TODO: verify existence and type; use validationError
    if ( hasInflu )
      await (await fromUuid(hasInflu.uuid)).draw({rollMode: CONST.DICE_ROLL_MODES.PRIVATE});  

    console.log(actor.system.socialStanding);
  }
}