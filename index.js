// Import telegraf and monopoly-js libraries
const { Telegraf } = require("telegraf");
const Monopoly = require("monopolygame");

// Create a new telegraf bot instance with your bot token
const bot = new Telegraf('6556435154:AAEQGipJZ6xeQOltYTTEuaVGqoAbuN8sUH0');

// Create a new monopoly game instance
const game = new Monopoly();

// Define some constants for the game commands and states
const START_COMMAND = "/start";
const JOIN_COMMAND = "/join";
const ROLL_COMMAND = "/roll";
const BUY_COMMAND = "/buy";
const SELL_COMMAND = "/sell";
const TRADE_COMMAND = "/trade";
const END_COMMAND = "/end";
const GAME_STATE = {
  WAITING: "waiting",
  PLAYING: "playing",
  ENDED: "ended",
};

// Initialize some variables for the game state and players
let gameState = GAME_STATE.WAITING;
let players = [];
let currentPlayerIndex = 0;

// Helper function to get the current player object
function getCurrentPlayer() {
  return players[currentPlayerIndex];
}

// Helper function to get the next player object
function getNextPlayer() {
  return players[(currentPlayerIndex + 1) % players.length];
}

// Helper function to format a player object as a string
function formatPlayer(player) {
  return `${player.name} (${player.money}$)`;
}

// Helper function to format a property object as a string
function formatProperty(property) {
  return `${property.name} (${property.price}$)`;
}

// Helper function to check if a player can afford a property
function canAfford(player, property) {
  return player.money >= property.price;
}

// Helper function to check if a property is owned by someone
function isOwned(property) {
  return property.owner !== null;
}

// Helper function to check if a property is owned by the current player
function isOwnedByCurrentPlayer(property) {
  return property.owner === getCurrentPlayer();
}

// Helper function to check if a property is mortgaged
function isMortgaged(property) {
  return property.mortgaged;
}

// Helper function to check if a trade offer is valid
function isValidTrade(offer, demand) {
  // Check if the offer and demand are arrays of properties
  if (!Array.isArray(offer) || !Array.isArray(demand)) {
    return false;
  }

  // Check if the offer and demand are not empty
  if (offer.length === 0 || demand.length === 0) {
    return false;
  }

  // Check if the offer and demand are owned by the respective players
  for (let property of offer) {
    if (!isOwnedByCurrentPlayer(property)) {
      return false;
    }
  }

  for (let property of demand) {
    if (!isOwnedByCurrentPlayer(property)) {
      return false;
    }
  }

  // Check if the offer and demand are not mortgaged
  for (let property of offer) {
    if (isMortgaged(property)) {
      return false;
    }
  }

  for (let property of demand) {
    if (isMortgaged(property)) {
      return false;
    }
  }

  // Check if the offer and demand have the same total value
  let offerValue = offer.reduce((sum, property) => sum + property.price, 0);
  let demandValue = demand.reduce((sum, property) => sum + property.price, 0);

  return offerValue === demandValue;
}

// Helper function to execute a trade between two players
function executeTrade(player1, player2, offer, demand) {
  // Transfer the properties from the offer to the demand player
  for (let property of offer) {
    property.owner = player2;
  }

  // Transfer the properties from the demand to the offer player
  for (let property of demand) {
    property.owner = player1;
  }
}

// Define a handler for the start command
bot.command('/start', (ctx) => {
  // Check if the game is already started
  if (gameState !== GAME_STATE.WAITING) {
    ctx.reply("The game is already started.");
    return;
  }

  // Check if the sender is already a player
  let sender = ctx.from;
  if (players.find((player) => player.id === sender.id)) {
    ctx.reply("You are already a player.");
    return;
  }

  // Create a new player object and add it to the players array
  let player = {
    id: sender.id,
    name: sender.first_name,
    money: game.startingMoney,
    position: game.startingPosition,
    properties: [],
  };
  players.push(player);

  // Reply with a welcome message and instructions
  ctx.reply(
    `Welcome ${player.name}! You have joined the game. To start the game, type ${START_COMMAND} again when everyone has joined. To see the list of players, type ${JOIN_COMMAND}.`,
  );
});

// Define a handler for the join command
bot.command(JOIN_COMMAND, (ctx) => {
  // Check if the game is already started
  if (gameState !== GAME_STATE.WAITING) {
    ctx.reply("The game is already started.");
    return;
  }

  // Check if there are any players
  if (players.length === 0) {
    ctx.reply("There are no players yet. To join the game, type /start.");
    return;
  }

  // Reply with the list of players
  let message = "The current players are:\n";
  for (let player of players) {
    message += formatPlayer(player) + "\n";
  }
  ctx.reply(message);
});

// Define a handler for the roll command
bot.command(ROLL_COMMAND, (ctx) => {
  // Check if the game is started and not ended
  if (gameState === GAME_STATE.WAITING) {
    ctx.reply(
      "The game is not started yet. To start the game, type /start again when everyone has joined.",
    );
    return;
  }

  if (gameState === GAME_STATE.ENDED) {
    ctx.reply("The game is already ended.");
    return;
  }

  // Check if the sender is the current player
  let sender = ctx.from;
  let currentPlayer = getCurrentPlayer();
  if (sender.id !== currentPlayer.id) {
    ctx.reply(`It's not your turn. It's ${currentPlayer.name}'s turn.`);
    return;
  }

  // Roll the dice and move the player
  let dice = game.rollDice();
  let oldPosition = currentPlayer.position;
  let newPosition = game.movePlayer(currentPlayer, dice);
  let property = game.board[newPosition];

  // Reply with the dice result and the new position
  ctx.reply(`${currentPlayer.name} rolled ${dice[0]} and ${dice[1]}.`);
  ctx.reply(
    `${currentPlayer.name} moved from ${game.board[oldPosition].name} to ${property.name}.`,
  );

  // Check if the player landed on a special square
  if (property.type === "go") {
    // Give the player some money
    game.giveMoney(currentPlayer, game.goReward);
    ctx.reply(
      `${currentPlayer.name} passed GO and collected ${game.goReward}$.`,
    );
  } else if (property.type === "jail") {
    // Send the player to jail
    game.sendToJail(currentPlayer);
    ctx.reply(`${currentPlayer.name} went to JAIL.`);
  } else if (property.type === "go-to-jail") {
    // Move the player to jail
    game.moveToJail(currentPlayer);
    ctx.reply(`${currentPlayer.name} was sent to JAIL.`);
  } else if (property.type === "free-parking") {
    // Do nothing
    ctx.reply(`${currentPlayer.name} is on FREE PARKING.`);
  } else if (property.type === "tax") {
    // Take some money from the player
    game.takeMoney(currentPlayer, property.tax);
    ctx.reply(`${currentPlayer.name} paid ${property.tax}$ in taxes.`);
  } else if (property.type === "chance") {
    // Draw a chance card and execute its action
    let card = game.drawChanceCard();
    ctx.reply(`${currentPlayer.name} drew a chance card: ${card.text}.`);
    game.executeCardAction(card, currentPlayer);
  } else if (property.type === "community-chest") {
    // Draw a community chest card and execute its action
    let card = game.drawCommunityChestCard();
    ctx.reply(
      `${currentPlayer.name} drew a community chest card: ${card.text}.`,
    );
    game.executeCardAction(card, currentPlayer);
  }

  // Check if the player can buy the property
  if (
    property.type === "property" ||
    property.type === "railroad" ||
    property.type === "utility"
  ) {
    if (!isOwned(property) && canAfford(currentPlayer, property)) {
      // Reply with a buy option
      ctx.reply(
        `${currentPlayer.name}, do you want to buy ${formatProperty(
          property,
        )}? Type ${BUY_COMMAND} to buy or ${END_COMMAND} to end your turn.`,
      );
      return;
    }
  }

  // End the turn and switch to the next player
  endTurn();
});

// Define a handler for the buy command
bot.command(BUY_COMMAND, (ctx) => {
  // Check if the game is started and not ended
  if (gameState === GAME_STATE.WAITING) {
    ctx.reply(
      "The game is not started yet. To start the game, type /start again when everyone has joined.",
    );
    return;
  }

  if (gameState === GAME_STATE.ENDED) {
    ctx.reply("The game is already ended.");
    return;
  }

  // Check if the sender is the current player
  let sender = ctx.from;
  let currentPlayer = getCurrentPlayer();
  if (sender.id !== currentPlayer.id) {
    ctx.reply(`It's not your turn. It's ${currentPlayer.name}'s turn.`);
    return;
  }

  // Get the property where the player is
  let property = game.board[currentPlayer.position];

  // Check if the property is buyable
  if (
    property.type !== "property" &&
    property.type !== "railroad" &&
    property.type !== "utility"
  ) {
    ctx.reply(`You can't buy ${property.name}.`);
    return;
  }

  // Check if the property is already owned
  if (isOwned(property)) {
    ctx.reply(`${property.name} is already owned by ${property.owner.name}.`);
    return;
  }

  // Check if the player can afford the property
  if (!canAfford(currentPlayer, property)) {
    ctx.reply(
      `You don't have enough money to buy ${formatProperty(property)}.`,
    );
    return;
  }

  // Buy the property and deduct the money from the player
  game.buyProperty(currentPlayer, property);
  ctx.reply(`${currentPlayer.name} bought ${formatProperty(property)}.`);

  // End the turn and switch to the next player
  endTurn();
});

// Define a handler for the sell command
bot.command(SELL_COMMAND, (ctx) => {
  // Check if the game is started and not ended
  if (gameState === GAME_STATE.WAITING) {
    ctx.reply(
      "The game is not started yet. To start the game, type /start again when everyone has joined.",
    );
    return;
  }

  if (gameState === GAME_STATE.ENDED) {
    ctx.reply("The game is already ended.");
    return;
  }

  // Check if the sender is the current player
  let sender = ctx.from;
  let currentPlayer = getCurrentPlayer();
  if (sender.id !== currentPlayer.id) {
    ctx.reply(`It's not your turn. It's ${currentPlayer.name}'s turn.`);
    return;
  }

  // Get the property name from the message
  let propertyName = ctx.message.text.replace(SELL_COMMAND, "").trim();

  // Check if the property name is valid
  if (!propertyName) {
    ctx.reply("Please specify the property name you want to sell.");
    return;
  }

  // Find the property by name
  let property = game.findPropertyByName(propertyName);

  // Check if the property exists
  if (!property) {
    ctx.reply(`There is no property named ${propertyName}.`);
    return;
  }

  // Check if the property is owned by the current player
  if (!isOwnedByCurrentPlayer(property)) {
    ctx.reply(`You don't own ${property.name}.`);
    return;
  }

  // Check if the property is mortgaged
  if (isMortgaged(property)) {
    ctx.reply(`You can't sell ${property.name} because it is mortgaged.`);
    return;
  }

  // Sell the property and give the money to the player
  game.sellProperty(currentPlayer, property);
  ctx.reply(`${currentPlayer.name} sold ${formatProperty(property)}.`);

  // End the turn and switch to the next player
  endTurn();
});

// Define a handler for the trade command
bot.command(TRADE_COMMAND, (ctx) => {
  // Check if the game is started and not ended
  if (gameState === GAME_STATE.WAITING) {
    ctx.reply(
      "The game is not started yet. To start the game, type /start again when everyone has joined.",
    );
    return;
  }

  if (gameState === GAME_STATE.ENDED) {
    ctx.reply("The game is already ended.");
    return;
  }

  // Check if the sender is the current player
  let sender = ctx.from;
  let currentPlayer = getCurrentPlayer();
  if (sender.id !== currentPlayer.id) {
    ctx.reply(`It's not your turn. It's ${currentPlayer.name}'s turn.`);
    return;
  }

  // Get the trade offer and demand from the message
  let tradeMessage = ctx.message.text.replace(TRADE_COMMAND, "").trim();

  // Check if the trade message is valid
  if (!tradeMessage) {
    ctx.reply(
      "Please specify the trade offer and demand in the format: /trade offer: property1, property2; demand: property3, property4.",
    );
    return;
  }

  // Split the trade message into offer and demand parts
  let tradeParts = tradeMessage.split(";");

  // Check if the trade parts are valid
  if (tradeParts.length !== 2) {
    ctx.reply(
      "Please specify the trade offer and demand in the format: /trade offer: property1, property2; demand: property3, property4.",
    );
    return;
  }

  // Get the offer and demand strings
  let offerString = tradeParts[0].replace("offer:", "").trim();
  let demandString = tradeParts[1].replace("demand:", "").trim();

  // Check if the offer and demand strings are valid
  if (!offerString || !demandString) {
    ctx.reply(
      "Please specify the trade offer and demand in the format: /trade offer: property1, property2; demand: property3, property4.",
    );
    return;
  }

  // Split the offer and demand strings into property names
  let offerNames = offerString.split(",");
  let demandNames = demandString.split(",");

  // Find the properties by name
  let offer = offerNames.map((name) => game.findPropertyByName(name.trim()));
  let demand = demandNames.map((name) => game.findPropertyByName(name.trim()));

  // Check if all the properties exist
  for (let i = 0; i < offer.length; i++) {
    if (!offer[i]) {
      ctx.reply(`There is no property named ${offerNames[i]}.`);
      return;
    }
  }

  for (let i = 0; i < demand.length; i++) {
    if (!demand[i]) {
      ctx.reply(`There is no property named ${demandNames[i]}.`);
      return;
    }
  }

  // Check if the trade offer is valid
  if (!isValidTrade(offer, demand)) {
    ctx.reply(
      "Your trade offer is not valid. Please make sure you own all the properties you are offering, they are not mortgaged, and they have the same total value as the properties you are demanding.",
    );
    return;
  }

  // Get the next player who is involved in the trade
  let nextPlayer = getNextPlayer();

  // Reply with a trade confirmation message and options
  ctx.reply(
    `${currentPlayer.name} wants to trade ${offer
      .map(formatProperty)
      .join(", ")} for ${demand.map(formatProperty).join(", ")} with ${
      nextPlayer.name
    }.`,
  );
});

// Define a handler for the end command
bot.command(END_COMMAND, (ctx) => {
  // Check if the game is started and not ended
  if (gameState === GAME_STATE.WAITING) {
    ctx.reply(
      "The game is not started yet. To start the game, type /start again when everyone has joined.",
    );
    return;
  }

  if (gameState === GAME_STATE.ENDED) {
    ctx.reply("The game is already ended.");
    return;
  }

  // Check if the sender is the current player
  let sender = ctx.from;
  let currentPlayer = getCurrentPlayer();
  if (sender.id !== currentPlayer.id) {
    ctx.reply(`It's not your turn. It's ${currentPlayer.name}'s turn.`);
    return;
  }

  // End the turn and switch to the next player
  endTurn();
});

// Define a helper function to end the turn and switch to the next player
function endTurn() {
  // Increment the current player index
  currentPlayerIndex = (currentPlayerIndex + 1) % players.length;

  // Get the next player object
  let nextPlayer = getNextPlayer();

  // Reply with a message to indicate the turn change
  ctx.reply(
    `It's ${nextPlayer.name}'s turn. Type ${ROLL_COMMAND} to roll the dice.`,
  );
}
