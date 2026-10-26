// Willowmere residents (Phase 7). Positions are tiles. Schedules use minutes
// after midnight. Until dedicated NPC art is supplied they are drawn with the
// player sprites, recoloured (`tint`: shirt hue, trousers hue, hair brightness;
// skin and boots are left alone) and scaled, with a name tag.

const h = (hour, min = 0) => hour * 60 + min;

export const NPCS = {
  mara: {
    id: 'mara', name: 'Mara', role: 'Shopkeeper', place: 'General Store',
    tint: { shirt: 135, pants: 40, hair: 1.7 }, scale: 0.97, accent: '#6fae5a',
    door: [43.4, 8.4], shop: 'general',
    schedule: [{ from: h(7), to: h(19), at: [43.4, 8.95], facing: 'down' }],
    wants: ['crop'],
    lines: {
      morning: ['Good morning! Fresh seeds and feed are on the shelf.', "Early bird! The shelves are freshly stocked."],
      day: ['Welcome! Take a look at my seeds and local produce.', 'Anything I can help you find today?'],
      evening: ["Almost closing time — what can I get you?", "Last customer of the day! Come in."],
    },
    chat: [
      ['You must be the new farmer from the old homestead. Good to meet you.', 'I run the store, and I hear everything first.'],
      ['Your carrots were the talk of the market. Keep them coming.', "I keep a few extra seeds back for neighbours who visit often."],
      ['Honestly, the village is livelier since you arrived.', 'I put the best seeds aside for you now.'],
      ['You are family to Willowmere now. Whatever you need, just ask.', "I'd trust you with the shop keys."],
    ],
  },
  bram: {
    id: 'bram', name: 'Bram', role: 'Blacksmith', place: 'Smithy',
    tint: { shirt: 28, pants: 205, hair: 0.55 }, scale: 1.08, accent: '#c0653a',
    door: [48.8, 8.2],
    schedule: [{ from: h(8), to: h(17), at: [47.5, 8.9], facing: 'down' }],
    wants: ['crop', 'wool'],
    lines: {
      morning: ['Mornin\'. Forge is warm.', 'Hmph. Early. I like that.'],
      day: ["Can't shake hands, mine are covered in soot.", 'Need something hammered, or just visiting?'],
      evening: ["Closing the forge soon. What is it?", 'Long day at the anvil.'],
    },
    chat: [
      ['I make nails, hinges and horseshoes. Not much for small talk.', 'Farm tools last longer if you oil them.'],
      ['That workshop of yours — good bones. Needs a bigger roof, though.', "I'll say this: you work hard."],
      ["Come by the forge after supper sometime. I'll show you how a hinge is made.", 'Folk round here say I smile twice a year. You get one of them.'],
      ['You are the best thing to happen to this road in years.', 'My door is always open to you.'],
    ],
  },
  odette: {
    id: 'odette', name: 'Odette', role: 'Innkeeper', place: 'Willow Inn',
    tint: { shirt: 320, pants: 280, hair: 2.1 }, scale: 0.96, accent: '#b0507a',
    door: [55.4, 17.0],
    schedule: [{ from: h(10), to: h(22), at: [55.4, 17.75], facing: 'down' }],
    wants: ['crop', 'egg', 'milk'],
    lines: {
      morning: ['Breakfast is on! Well, nearly.', 'Morning, dear. Kettle is on.'],
      day: ['Welcome to the Willow Inn! Sit, sit.', 'The stew smells good today, if I say so myself.'],
      evening: ['Busy evening! Make yourself comfortable.', 'The fire is lit — come in from the cold.'],
    },
    chat: [
      ['Travellers pass through all year. They always ask about the farm on the hill.', 'Everyone sleeps better with a full belly.'],
      ['Your eggs make the best custard in the valley.', "I'm always short of milk and tomatoes — remember that."],
      ['Between us, the mayor snores. Loudly.', 'You have a way of making this place feel like home.'],
      ['Dear, you are the heart of this village now.', 'There is always a bed and a bowl waiting for you.'],
    ],
  },
  tobias: {
    id: 'tobias', name: 'Tobias', role: 'Trader', place: 'Market stall',
    tint: { shirt: 50, pants: 18, hair: 0.8 }, scale: 1.0, accent: '#d6a13a', shop: 'trader',
    door: [45.2, 15.1],
    schedule: [{ from: h(8), to: h(16), at: [46.5, 15.55], facing: 'left' }],
    wants: ['crop', 'egg', 'milk', 'wool'],
    lines: {
      morning: ['Fresh off the cart! Looking to sell?', 'Early customers get the best prices.'],
      day: ['Best prices in the valley, right here!', "Bring me good produce and I'll pay a premium."],
      evening: ['Packing up soon — one last deal?', "Make it quick, my donkey's getting restless."],
    },
    chat: [
      ['I travel between villages. Willowmere pays fair.', 'Quality produce sells itself.'],
      ['I only buy so much of one thing per day. Mix it up and you earn more.', 'Eggs and milk always move fast.'],
      ['You know, I have started saving my best coins for your goods.', "Fewer people grow produce like yours."],
      ['If I ever settle down, it will be here, near your farm.', 'You and I could run this valley.'],
    ],
  },
  wren: {
    id: 'wren', name: 'Wren', role: 'Village resident', place: 'Village square',
    tint: { shirt: 175, pants: 330, hair: 1.4 }, scale: 0.86, accent: '#4aa6b0',
    door: [49.0, 15.4],
    wander: { from: h(7, 30), to: h(20), every: 90, points: [[47.6, 11.0], [50.6, 11.3], [49.0, 14.2], [51.8, 13.0], [46.2, 12.6]] },
    wants: ['egg', 'crop'],
    lines: {
      morning: ['Hi! Are you the farmer? Is it true you have chickens?', 'I wake up early to watch the birds.'],
      day: ['Hello! I like it when the market is busy.', 'Do you want to see my favourite spot?'],
      evening: ["I'm not tired yet, honest.", 'The lanterns are my favourite.'],
    },
    chat: [
      ['I live behind the inn. Odette says I ask too many questions.', 'What is it like on a farm?'],
      ['I have named every duck on the pond. They do not know.', 'Can I help water your plants one day?'],
      ['You are my favourite grown-up. Do not tell Bram.', 'I counted the lanterns: there are four!'],
      ['When I grow up I want a farm just like yours.', 'You are the coolest.'],
    ],
  },
};

export const NPC_LIST = Object.values(NPCS);

export function periodOf(minuteOfDay) {
  if (minuteOfDay < h(12)) return 'morning';
  if (minuteOfDay < h(17)) return 'day';
  return 'evening';
}
