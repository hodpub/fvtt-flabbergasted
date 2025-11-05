import { onManageActiveEffect } from '../helpers/effects.mjs';
import { editMembersRoles, prepareMembersRolesData } from '../helpers/membersRoles.mjs';
import { clubUpgradeTemplate, rollTemplate } from '../helpers/templates.mjs';

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {foundry.appv1.sheets.ActorSheet}
 */
export class FlabbergastedActorSheet extends foundry.appv1.sheets.ActorSheet {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['flabbergasted', 'sheet', 'actor'],
      width: 800,
      height: 660,
      tabs: [
        {
          navSelector: '.sheet-tabs',
          contentSelector: '.sheet-body',
          initial: 'features',
        },
      ],
    });
  }

  /** @override */
  get template() {
    return `systems/flabbergasted/templates/actor/actor-${this.actor.type}-sheet.hbs`;
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
    // Retrieve the data structure from the base sheet. You can inspect or log
    // the context variable to see the structure, but some key properties for
    // sheets are the actor object, the data object, whether or not it's
    // editable, the items array, and the effects array.
    const context = super.getData();

    // Use a safe clone of the actor data for further operations.
    const actorData = this.document.toPlainObject();

    // Add the actor's data to context.data for easier access, as well as flags.
    context.system = actorData.system;
    context.flags = actorData.flags;

    // Adding a pointer to CONFIG.FLABBERGASTED
    context.config = CONFIG.FLABBERGASTED;

    // Prepare character data and items.
    if (actorData.type == 'character') {
      this._prepareItems(context);
      await this._prepareCharacterData(context);
    }
    else if (actorData.type == "socialClub") {
      await this._prepareSocialClubData(context);
    }
    else if (actorData.type == "archetype") {
      this._prepareItems(context);
      await this.actor.system.prepareData(context);
    }

    return context;
  }

  /**
   * Character-specific context modifications
   *
   * @param {object} context The context object to mutate
   */
  async _prepareCharacterData(context) {
    // This is where you can enrich character-specific editor fields
    // or setup anything else that's specific to this type

    context.socialStandingValues = [];
    for (let index = -10; index <= 10; index++) {
      if (index == 0) {
        context.socialStandingValues.push(0);
        continue;
      }

      if (index < 0 && context.system.socialStanding < 0 && index >= context.system.socialStanding) {
        context.socialStandingValues.push(Math.abs(index));
        continue;
      }

      if (index > 0 && context.system.socialStanding > 0 && index <= context.system.socialStanding) {
        context.socialStandingValues.push(index);
        continue;
      }

      context.socialStandingValues.push("");
    }

    context.traits = [];
    context.socialClub = undefined;
    if (context.system.socialClub) {
      context.socialClub = await fromUuid(context.system.socialClub);
    }
    for (const trait of Object.keys(CONFIG.FLABBERGASTED.traits)) {
      let maxValue = 4;
      if (context.socialClub?.system.traits) {
        maxValue = context.socialClub?.system.traits[trait] ?? 4;
      }
      const t = {
        id: trait,
        label: CONFIG.FLABBERGASTED.traits[trait],
        value: this.actor.system.traits[trait],
        max: maxValue
      };
      context.traits.push(t);
    }
  }

  /**
   * Organize and classify Items for Actor sheets.
   *
   * @param {object} context The context object to mutate
   */
  _prepareItems(context) {
    // Initialize containers.
    let sceneCues = [];

    // Iterate through items, allocating to containers
    for (let i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;
      // Append to gear.
      if (i.type === 'item') {
        gear.push(i);
      }
      // Append to spells.
      else if (i.type === 'sceneCue') {
        i.usages = [];
        for (let index = 1; index <= i.system.maxUsage; index++) {
          let usage = {
            disabled: index <= i.system.availableUsage ? "" : "disabled",
            checked: index > i.system.used ? "" : "checked"
          };

          i.usages.push(usage);
        }
        sceneCues.push(i);
      }
      else if (i.type == "flaw") {
        i.system.description = `<p><strong>${i.name}</strong></p>${i.system.description}`;
        context.flaw = i;
      }
    }

    sceneCues = sceneCues
      .sort((a, b) => {
        let aValue = 0;
        let bValue = 0;
        if (a.system.availableUsage > 0)
          aValue = 1;
        if (b.system.availableUsage > 0)
          bValue = 1;

        return bValue - aValue || a.name.localeCompare(b.name);
      });

    // Assign and return
    context.sceneCues = sceneCues;
  }

  async _prepareSocialClubData(context) {
    context.renown = [];
    for (let index = 1; index <= 15; index++) {
      context.renown.push(context.system.renown >= index ? index : "");
    }
    context.upgrades = [];
    for (let i of context.items) {
      i.canUse = i.system.hasUsage && !i.system.used;
      context.upgrades.push(i);
    }
    context.membersRoles = await prepareMembersRolesData(context);
    context.system.maxMembers = context.system.maxMembers || 50;
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Render the item sheet for viewing/editing prior to the editable check.
    html.on('click', '.item-edit', (ev) => {
      const li = $(ev.currentTarget).parents('.item');
      const item = this.actor.items.get(li.data('itemId'));
      item.sheet.render(true);
    });

    // -------------------------------------------------------------
    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Add Inventory Item
    html.on('click', '.item-create', this._onItemCreate.bind(this));

    // Delete Inventory Item
    html.on('click', '.item-delete', this._onItemDelete.bind(this));

    // Active Effect management
    html.on('click', '.effect-control', (ev) => {
      const row = ev.currentTarget.closest('li');
      const document =
        row.dataset.parentId === this.actor.id
          ? this.actor
          : this.actor.items.get(row.dataset.parentId);
      onManageActiveEffect(ev, document);
    });

    // Rollable abilities.
    html.on('click', '.rollable', this._onRoll.bind(this));
    html.on('click', '.rollable.trait', this._onTraitClick.bind(this));
    html.on('click', '.rollable.status', this._onStatusClick.bind(this));
    html.on('click', '.rollable.luck-coin', this._onLuckCoinClick.bind(this));
    html.on('click', '.rollable.nickname', this._onNicknameClick.bind(this));
    html.on('click', '.rollable.members-roles-edit', this._updateMemberRoles.bind(this));
    html.on('click', '.rollable.socialClub', this._onDeleteSocialClub.bind(this));
    html.on('click', '.rollable.deleteFlaw', this._onDeleteFlaw.bind(this));

    // Drag events for macros.
    if (this.actor.isOwner) {
      let handler = (ev) => this._onDragStart(ev);
      html.find('li.item').each((i, li) => {
        if (li.classList.contains('inventory-header')) return;
        li.setAttribute('draggable', true);
        li.addEventListener('dragstart', handler, false);
      });
    }

    // Create context menu for items on both sheets
    this._contextMenu(html);
  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */
  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    // Get the type of item to create.
    const type = header.dataset.type;
    // Grab any data associated with this control.
    const data = duplicate(header.dataset);
    // Initialize a default name.
    const name = `New ${type.capitalize()}`;
    // Prepare the item object.
    const itemData = {
      name: name,
      type: type,
      system: data,
    };
    // Remove the type from the dataset since it's in the itemData.type prop.
    delete itemData.system['type'];

    // Finally, create the item!
    return await Item.create(itemData, { parent: this.actor });
  }

  async _onItemDelete(event) {
    event.preventDefault();
    const li = $(ev.currentTarget).parents('.item');
    const item = this.actor.items.get(li.data('itemId'));
    item.delete();
    li.slideUp(200, () => this.render(false));
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  async _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    // Handle item rolls.
    if (dataset.rollType) {

      console.log(dataset);
      if (dataset.rollType == "dignity")
        return this._updateSocialStanding(true);

      if (dataset.rollType == "scandal")
        return this._updateSocialStanding(false);

      if (dataset.rollType == "renown-minus")
        return this._updateClubRenown(false);

      if (dataset.rollType == "renown-plus")
        return this._updateClubRenown(true);

      const itemId = element.closest('.item').dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (!item)
        return;

      if (dataset.rollType == 'item') {
        return item.roll();
      }
      if (dataset.rollType == 'scene-cue' || dataset.rollType == "club-upgrade") {
        let eventType = 0;
        if (event.shiftKey)
          eventType = 1;
        else if (event.altKey)
          eventType = 2;
        return await item.system.roll(this.actor, eventType);
      }

    }

    // Handle rolls that supply the formula directly.
    if (dataset.roll) {
      let label = dataset.label ? `[ability] ${dataset.label}` : '';
      let roll = new Roll(dataset.roll, this.actor.getRollData());
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label,
        rollMode: game.settings.get('core', 'rollMode'),
      });
      return roll;
    }


  }

  _contextMenu(html) {
    ContextMenu.create(this, html, "div.scene-cue", this._getItemContextOptions());
    ContextMenu.create(this, html, "div.upgrade", this._getItemContextOptions());
  }

  _getItemContextOptions() {
    return [
      {
        name: "SIDEBAR.Edit",
        icon: '<i class="fas fa-edit"></i>',
        condition: _ => this.actor.isOwner,
        callback: element => {
          const itemId = element.data("itemId");
          const item = this.actor.items.get(itemId);
          return item.sheet.render(true);
        },
      },
      {
        name: "SIDEBAR.Delete",
        icon: '<i class="fas fa-trash"></i>',
        condition: _ => this.actor.isOwner,
        callback: element => {
          const itemId = element.data("itemId");
          const item = this.actor.items.get(itemId);
          element.slideUp(200, () => this.render(false));
          item.delete();
        },
      },
    ];
  }

  async _updateSocialStanding(increaseDignity) {
    const increase = increaseDignity ? -1 : 1;
    let newSocialStanding = this.actor.system.socialStanding + increase;
    newSocialStanding = Math.max(-10, Math.min(10, newSocialStanding));
    await this.actor.update({ "system.socialStanding": newSocialStanding });
  }

  async _onTraitClick(event) {
    event.preventDefault();
    let element = event.currentTarget;
    let field = element.dataset.field;
    let value = parseInt(element.dataset.actionValue ? element.dataset.actionValue : "0");
    let minValue = 1;

    if (element.dataset.trait == this.actor.system.archetypeTrait) {
      minValue = 2;
    }

    if (event.altKey) {
      return this.actor.update({ [field]: (value - 1 >= minValue) ? value - 1 : value });
    }
    else if (event.shiftKey) {
      let max = parseInt(element.dataset.actionMaxValue);
      return this.actor.update({ [field]: (value + 1 <= max) ? value + 1 : value });
    }
    else {
      return await this._rollTrait(element.dataset.trait);
    }
  }

  async _rollTrait(trait) {
    console.log(trait);
    let formula = `${this.actor.system.traits[trait]}d6cs>=5`;

    let roll = await new Roll(formula).roll();
    let traitKey = `FLABBERGASTED.Traits.${trait[0].toUpperCase() + trait.slice(1)}`;
    let content = `<h2>${game.i18n.localize(traitKey)}</h2>`;
    let totalText = "";
    switch (roll.total) {
      case 0:
        totalText = "(Fail)"
        break;
      case 1:
        totalText = "Success"
        break;
      default:
        totalText = "Successes"
        break;
    }

    const chatContent = await foundry.applications.handlebars.renderTemplate(rollTemplate, {
      flavor: content,
      formula: roll.formula,
      tooltip: await roll.getTooltip(),
      total: `${roll.total}`,
      totalText: totalText,
      totalClass: roll.total > 0 ? "success" : "failure"
    });
    roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: chatContent
    });
  }

  async _onStatusClick(event) {
    event.preventDefault();
    let value = 0;
    if (event.altKey)
      value = -1;
    else if (event.shiftKey)
      value = 1;
    const newValue = this.actor.system.status + value;
    await this.actor.update({ "system.status": Math.max(1, Math.min(3, newValue)) });
  }

  async _onLuckCoinClick(event) {
    event.preventDefault();
    let value = 0;
    if (event.altKey)
      value = -1;
    else if (event.shiftKey)
      value = 1;
    const newValue = this.actor.system.luckCoin + value;
    await this.actor.update({ "system.luckCoin": Math.max(0, Math.min(3, newValue)) });
  }

  async _onNicknameClick(event) {
    event.preventDefault();
    await this.actor.update({ "system.nicknameUsed": !event.altKey });
  }

  async _updateClubRenown(increase) {
    increase = increase ? 1 : -1;
    let newRenown = this.actor.system.renown + increase;
    newRenown = Math.max(0, Math.min(15, newRenown));
    await this.actor.update({ "system.renown": newRenown });
  }

  async _updateMemberRoles(event) {
    event.preventDefault();
    await editMembersRoles(this.actor);
  }

  async _onDropItemCreate(itemData) {
    switch (this.actor.type) {
      case "socialClub":
        return await this._onDropItemCreateForSocialClub(itemData);
      case "character":
      case "archetype":
        return await this._onDropItemCreateForCharacter(itemData);
      default:
        return;
    }
  }

  async _onDropItemCreateForSocialClub(itemData) {
    if (itemData.type != "clubUpgrade")
      return;

    let cancel = false;
    if (itemData.system.minRenown > this.actor.system.renown) {
      ui.notifications.error('FLABBERGASTED.SocialClub.Errors.Renown', { localize: true });
      cancel = true;
    }
    else if (itemData.system.readies > this.actor.system.funds) {
      ui.notifications.error('FLABBERGASTED.SocialClub.Errors.Funds', { localize: true });
      cancel = true;
    }
    else if (itemData.system.extraRequirement) {
      cancel = !(await Dialog.confirm({
        content: `<p>The club upgrade has the following extra requirement:</p><p><strong>${itemData.system.extraRequirement}</strong></p><p>Did the Club fulfill this requirement?</p>`
      }));
      console.log(cancel);
    }

    console.log(cancel);
    if (cancel)
      return;

    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings.get('core', 'rollMode');

    const content = await foundry.applications.handlebars.renderTemplate(clubUpgradeTemplate, {
      clubUpgrade: itemData,
      acquired: true
    });

    await ChatMessage.create({
      speaker: speaker,
      rollMode: rollMode,
      content: content,
    });

    await this.actor.update({ "system.funds": this.actor.system.funds - itemData.system.readies });
    return super._onDropItemCreate(itemData);
  }

  async _onDropItemCreateForCharacter(itemData) {
    if (itemData.type == "flaw")
      return this._addFlaw(itemData);

    if (itemData.type != "sceneCue" && !Array.isArray(itemData))
      return;

    return super._onDropItemCreate(itemData);
  }

  async _onDropActor(event, data) {
    if (!this.actor.isOwner) return false;

    if (this.actor.type != "character")
      return false;

    const loadedActor = await fromUuid(data.uuid);
    if (loadedActor.type == "archetype")
      return await this._setArchetype(loadedActor);

    if (loadedActor.type == "socialClub")
      return await this._setSocialClub(loadedActor);
  }

  async _setArchetype(archetype) {
    if (this.actor.system.archetype) {
      const confirmation = await Dialog.confirm({
        content: game.i18n.localize("FLABBERGASTED.CharacterArchetypeError")
      });
      if (!confirmation)
        return;

      let deleteItems = this.actor.items.map((i) => i.id);
      this.actor.deleteEmbeddedDocuments("Item", deleteItems);
    }

    let updates = {
      "system.archetype": archetype.name,
      "system.archetypeTrait": archetype.system.primaryTrait,
      "system.readies": archetype.system.readies,
      "system.hasProfession": archetype.system.hasProfession,
      "system.profession": "",
      "system.title": "",
      "system.estate": "",
      "system.traits.bp": 1,
      "system.traits.ce": 1,
      "system.traits.ws": 1,
      "system.traits.cp": 1,
    };

    updates[`system.traits.${archetype.system.primaryTrait}`] = 2;

    if (this.actor.img == "icons/svg/mystery-man.svg" || await Dialog.confirm({
      content: game.i18n.localize("FLABBERGASTED.UpdateImageArchetype")
    })) {
      updates["img"] = archetype.img;
      updates["prototypeToken.texture.src"] = archetype.img;
    }

    await this.actor.update(updates);

    let items = await Promise.all(archetype.items.map(async (i) => (await fromUuid(i.uuid)).toObject()));
    this.actor.createEmbeddedDocuments("Item", items);
  }

  async _setSocialClub(socialClub) {
    if (this.actor.system.socialClub) {
      const confirmation = await Dialog.confirm({
        content: game.i18n.localize("FLABBERGASTED.CharacterSocialClubError")
      });
      if (!confirmation)
        return;
    }

    let updates = {
      "system.socialClub": socialClub.uuid
    };
    await this.actor.update(updates);
  }

  async _onDeleteSocialClub(event) {
    event.preventDefault();
    await this.actor.update({ "system.socialClub": null });
    console.log(this.actor);
  }

  async _onDeleteFlaw(event) {
    event.preventDefault();
    const currentFlaw = this.actor.items.filter(it => it.type == "flaw")[0];
    currentFlaw.delete();
  }

  async _addFlaw(itemData) {
    const currentFlaw = this.actor.items.filter(it => it.type == "flaw")[0];
    if (currentFlaw != undefined) {
      const confirmation = await Dialog.confirm({
        content: game.i18n.localize("FLABBERGASTED.CharacterFlawError")
      });
      if (!confirmation)
        return;

      currentFlaw.delete();
    }

    return super._onDropItemCreate(itemData);
  }
}
