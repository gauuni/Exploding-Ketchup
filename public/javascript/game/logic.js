jQuery(document).ready(function($) {
    
    //Main game instance
    var main = new EK();
    
    //Connect to socket
    io = io.connect();
    
    //******** Click Events ********//
    
    $("#loginButton").click(function() {
        var nickname = $('#nameInput').val();
        io.emit($C.LOBBY.CONNECT, { nickname: nickname });
    });
    
    $("#newGameButton").click(function() {
        var name = prompt("Type in a title:", "bob");
        if (name) {
            io.emit($C.GAME.CREATE, { title: name });
        }
    });
    
    //Since we dynamically create the button, we have to call the clikc function this way
    $(document).on('click', '#joinGameButton', function() {
        var id = $(this).data("id");
        if (id) {
            io.emit($C.GAME.JOIN, { gameId: id });
        }
    });
    
    $('#startGameButton').click(function() {
        var user = main.getCurrentUser();
        var game = main.getCurrentUserGame();
        if (user && game) {
            if (!game.isGameHost(user)) {
                GameRoom.logMessage('Error: Game can only be started by hosts');
                return;
            }
            
            if (!game.canStart()) {
                GameRoom.logMessage('Cannot start game.');
                return;
            }
            
            io.emit($C.GAME.START, { gameId: game.id });
        }
    });
    
    $('#readyGameButton').click(function() {
        var game = main.getCurrentUserGame();
        if (game) {
            io.emit($C.GAME.PLAYER.READY, { gameId: game.id });
        };
    });
    
    $('#playGameButton').click(function() {
        var cards = $("#playingInput .card[data-selected='true']");
    
        switch (cards.length) {
            case 1:
                var card = main.gameData.getCardFromHand(cards.data('id'));
                if (card.type === $C.CARD.FAVOR) {
                    GameRoom.showFavorSelectOverlay(main);
                } else {
                    io.emit($C.GAME.PLAYER.PLAY, { 
                        gameId: main.getCurrentUserGame().id,
                        cards: cardIdsFromDOMData(cards)
                    });
                }
                break;
            case 2:
                GameRoom.showBlindStealOverlay(main);
                break;
            case 3:
                GameRoom.showNamedStealOverlay(main);
                break;
            case 5:
                GameRoom.showDiscardStealOverlay(main);
                break;
        }
    });
    
    //Card click
    $(document).on('click', '#playingInput .card', function() {
        toggleCardSelected($(this));
        GameRoom.updateInputDisplay(main);
    });
    
    $(document).on('click', '#givePopup .card', function() {
        $('#givePopup .card').attr('data-selected', "false");
        toggleCardSelected($(this));
        GameRoom.updateInputDisplay(main);
    });
    
    $(document).on('click', '#discardStealPopup .card', function() {
        $('#discardStealPopup .card').attr('data-selected', "false");
        toggleCardSelected($(this));
        GameRoom.updateInputDisplay(main);
    });
    
    $(document).on('click', '#namedStealPopup .card', function() {
        $('#namedStealPopup .card').attr('data-selected', "false");
        toggleCardSelected($(this));
        GameRoom.updateInputDisplay(main);
    });
    
    //******** IO Events ********//
    
    io.on($C.LOBBY.CONNECT, function(data) {
        if (data.hasOwnProperty('success')) {
            
            var connectedUsers = data.connectedUsers;
            var gameList = data.gameList;
            
            //Add the connected users to the user list
            $.each(connectedUsers, function(key, user) {
                main.addUser(new User(user.id, user.name));
            });
            
            //Add the games to the list
            $.each(gameList, function(key, game) {
                main.addGame(gameFromData(game));
            });
            
            //Set the current user
            var user = main.users[data.user.id];
            main.currentUser = data.user.id;
            
            //Update displays
            Lobby.updateUserList(main);
            Lobby.updateGameList(main);
            
            //Hide login
            Login.hide(); 
        }
        
        if (data.hasOwnProperty('error')) {
            Login.showError(data.error);
        }
    });
    
    io.on($C.USER.CONNECT, function(data) {
        main.addUser(new User(data.user.id, data.user.name));
        Lobby.updateUserList(main);
    });
    
    io.on($C.USER.DISCONNECT, function(data) {
        main.removeUser(data.user.id);
        Lobby.updateUserList(main);
    });
    
    io.on($C.GAME.CREATE, function(data) {
        if (!data.hasOwnProperty('error')) {
            //Hide lobby
            Lobby.hide();
            
            //Set the current game
            main.getCurrentUser().currentGame = data.game.id;
            main.gameData = new GameData();
            
            //Update
            GameRoom.update(main);
            
            //Bob
            GameRoom.logMessage(main.getCurrentUser().name + ' joined the game.');
            
            //Ready up
            io.emit($C.GAME.PLAYER.READY, { gameId: data.game.id});
        }
    });
    
    io.on($C.GAME.CREATED, function(data) {
        main.addGame(gameFromData(data.game));
        Lobby.updateGameList(main);
    });
    
    io.on($C.GAME.START, function(data) {
        if (data.hasOwnProperty('error')) {
            GameRoom.logMessage('Error: ' + data.error);
        } else {
            //Update game data
            main.addGame(gameFromData(data.game));
            
            //Reset local game data
            main.gameData = new GameData();
            GameRoom.update(main);
            
            //Get hand
            io.emit($C.GAME.PLAYER.HAND, { gameId: main.getCurrentUserGame().id });

            GameRoom.logMessage('Started Game!');
        }
    });
    
    io.on($C.GAME.STARTED, function(data) {
        main.addGame(gameFromData(data.game));
        Lobby.updateGameList(main);
    });
    
    io.on($C.GAME.STOP, function(data) {
        //Update game data
        main.addGame(gameFromData(data.game));
        GameRoom.update(main);
        
        //Reset local game data
        main.gameData = new GameData();
        GameRoom.updateCardDisplay(main);
    });
    
    io.on($C.GAME.STOPPED, function(data) {
        main.addGame(gameFromData(data.game));
        Lobby.updateGameList(main);
    });
    
    io.on($C.GAME.WIN, function(data) {
        GameRoom.logMessage(data.user.name + ' WON!');
    });
          
    io.on($C.GAME.REMOVED, function(data) {
        main.removeGame(data.id);
        
        //Replace the current game room for user
        if (main.getCurrentUserGame() && main.getCurrentUserGame().id == data.id) {
            main.getCurrentUser().currentGame = null;
        }
        
        Lobby.updateGameList(main);
    });
    
    io.on($C.GAME.JOIN, function(data) {
        if (data.hasOwnProperty('success')) {
            //Hide lobby
            Lobby.hide();
            
            //Update data we have
            main.addGame(gameFromData(data.game));
            
            //Set the current game
            main.getCurrentUser().currentGame = data.game.id;
            main.gameData = new GameData();
            
            //Update
            GameRoom.update(main);
            GameRoom.logMessage(main.getCurrentUser().name + ' joined the game.');
        }
    });
    
    io.on($C.GAME.LEAVE, function(data) {
        if (data.hasOwnProperty('success')) {
            //Show lobby
            Lobby.show();
            
            //Reset stats
            main.gameData = new GameData();
            GameRoom.updateCardDisplay(main);
            
            main.getCurrentUser().currentGame = null;
        }
    });
    
    //Update player ready state
    io.on($C.GAME.PLAYER.READY, function(data) {
        var game = main.getCurrentUserGame();
        
        if (game) {
            game.updatePlayer(data.player)
        }
        
        //Force the game host to be ready
        forceGameHostReady(game);
        
        //Update
        GameRoom.update(main);
    });
    
    io.on($C.GAME.PLAYER.CONNECT, function(data) {
        //Update game data
        main.addGame(gameFromData(data.game));
        GameRoom.update(main);
        GameRoom.logMessage(data.player.user.name + ' joined the game.');
    });
    
    io.on($C.GAME.PLAYER.DISCONNECT, function(data) {
        //Update game data
        main.addGame(gameFromData(data.game));
        GameRoom.update(main);
        GameRoom.logMessage(data.player.user.name + ' left the game.');
        
        //We need to check if current user was getting a favor or giving a favor to the disconnected player
        var player = data.player;
        if (player) {
            var user = player.user;
            
            if (user.id === main.gameData.favor.to) {
                //We asked this player for a favor
                main.gameData.favor.to = null;
                GameRoom.hideOverlay();
                GameRoom.logMessage("The coward feld!");
            }
            
            if (user.id === main.gameData.favor.from) {
                //We got asked for a favor from this user
                main.gameData.favor.from = null;
                GameRoom.hideOverlay();
                GameRoom.logMessage("You did the man a favor and kicked his butt!");
            }
        }
        
        //We may have a new game host, so force them to be ready
        forceGameHostReady(main.games[data.game.id]);
    });
    
    io.on($C.GAME.PLAYER.HAND, function(data) {
        var game = main.getCurrentUserGame();
        if (game) {
            main.gameData.hand = data.hand;
            
            //Update display for the user
            GameRoom.update(main);
        }
    });
    
    io.on($C.GAME.PLAYER.FUTURE, function(data) {
        var cards = data.cards;
        if (cards.length > 0) {
            //Tell player of the cards they see
            var string = "You see a ";
            $.each(cards, function(index, card) {
                string += card.name + ', ';
            });
            string = string.slice(0, -2); //Remove ', '
            GameRoom.logMessage(string);
        } else {
            GameRoom.logMessage('There is nothing to see!');
        }
    });
    
    io.on($C.GAME.DISCARDPILE, function(data) {
        var game = main.getCurrentUserGame();
        if (game) {
            main.gameData.discardPile = data.cards;
            //TODO: Update UI here
            GameRoom.update(main);
        }
    });
    
    io.on($C.GAME.PLAYER.ENDTURN, function(data) {
        if (data.hasOwnProperty('error')) {
            GameRoom.logMessage('Error: ' + data.error);
        } else if (data.hasOwnProperty('force')) {
            //Force end turn
            io.emit($C.GAME.PLAYER.ENDTURN, { gameId: main.getCurrentUserGame().id });
        } else {
            //Update game data
            main.addGame(gameFromData(data.game));
            GameRoom.update(main);
            
            var game = main.getCurrentUserGame();
            var user = data.player.user;
            var message = null;
            switch (data.state) {
                case $C.GAME.PLAYER.TURN.DEFUSED:
                    message = user.name + " defused the bomb!";
                    break;
                case $C.GAME.PLAYER.TURN.EXPLODED:
                    message = user.name + " exploded!";
                    break;
                case $C.GAME.PLAYER.TURN.SURVIVED:
                    message = user.name + " survived their turn.";
                    break;
            }
            
            //Send the state message to user
            if (message) {
                GameRoom.logMessage(message);
            }
            
            //Send messages to users
            if (data.state == $C.GAME.PLAYER.TURN.SURVIVED) {
                var nextPlayer = game.getCurrentPlayer();
                var nextUser = main.users[nextPlayer.user];
                var currentUser = main.getCurrentUser();
                
                //The turn message
                var turnMessage = (currentUser.id === nextUser.id) ? "It is your turn!" : "It is " + nextUser.name + "'s turn!";
                GameRoom.logMessage(turnMessage);
                
                //Tell the player how much they have to draw
                if (currentUser.id === nextUser.id) {
                    GameRoom.logMessage("Draw " + nextPlayer.drawAmount + " cards!");
                }
                
            }
        }
    
    });
    
    io.on($C.GAME.PLAYER.DRAW, function(data) {
        //Update data
        var game = EK.getCurrentUserGame();
        if (game) {
            game.updatePlayer(data.player);
        }
        main.gameData.hand = data.hand;
        GameRoom.updateCardDisplay(main);
        
        //Tell the user what cards they drew
        if (data.cards) {
            var type = "";
            $.each(data.cards, function(index, card) {
                GameRoom.logMessage("You drew a " + card.type);
            });
        }
    });
    
    io.on($C.GAME.PLAYER.PLAY, function(data) {
        if (data.hasOwnProperty('error')) {
            GameRoom.logMessage("Error: " + data.error);
        } else {
            //Tell users that a player played cards
            var user = data.player.user;
            var cards = data.cards;
            if (cards) {
                $.each(cards, function(index, card) {
                    GameRoom.logMessage(user.name + " played a " + card.type + " card.");
                });
            }
            
            //Get hand again once playing
            var cUser = main.getCurrentUser();
            if (cUser && cUser.id === user.id) {
                io.emit($C.GAME.PLAYER.HAND, { gameId: main.getCurrentUserGame().id });
            }
        }
    });
    
    io.on($C.GAME.PLAYER.STEAL, function(data) {
        var from = main.users[data.from];
        var to = main.users[data.to];
        var currentUser = main.getCurrentUser();
        var fromString = (currentUser.id === from.id) ? "You" : from.name;
        var toString = (currentUser.id === to.id) ? "You" : to.name;
        
        switch(data.type) {
            case $C.CARDSET.STEAL.BLIND:
                GameRoom.logMessage(fromString + " took a card from " + toString);
                break;
            case $C.CARDSET.STEAL.NAMED:
                if (data.success) {
                    GameRoom.logMessage(fromString + " took a " + data.cardType + " from " + toString);
                } else {
                    GameRoom.logMessage(fromString + " failed to take a " + data.cardType + " from " + toString);
                }
                break;
            case $C.CARDSET.STEAL.DISCARD:
                if (data.success) {
                    GameRoom.logMessage(fromString + " took a " + data.card.name + " from the discard pile.");
                } else {
                    GameRoom.logMessage(fromString + " failed to take a " + data.card.name + " from  the discard pile.");
                }
                break;
        }
        
        //Update hand
        if (currentUser.id === from.id || currentUser.id === to.id) {
            io.emit($C.GAME.PLAYER.HAND, { gameId: main.getCurrentUserGame().id });
        }
    });
    
    io.on($C.GAME.PLAYER.FAVOR, function(data) {
        var from = main.users[data.from.id];
        var to = main.users[data.to.id];
        var currentUser = main.getCurrentUser();
        var fromString = (currentUser.id === from.id) ? "You" : from.name;
        var toString = (currentUser.id === to.id) ? "You" : to.name;
        
        if (data.hasOwnProperty('force')) {
            GameRoom.logMessage(fromString + " asked " + toString + " for a favor.");
            
            if (currentUser.id === from.id) {
                //Current user asked the favor. Disable end turn button
                main.gameData.favor.to = to.id;
                GameRoom.showFavorWaitOverlay(main);
            }
            
            if (currentUser.id === to.id) {
                //From user asked current user for a favor
                //Show the favor screen
                main.gameData.favor.from = from.id;
                GameRoom.showGiveOverlay(main);
            }
            
        } else if (data.hasOwnProperty('success')) {
            GameRoom.logMessage(fromString + " gave " + toString + " a " + data.card.type + ".");
            
            if (currentUser.id === to.id) {
                //From user did current user a favor
                main.gameData.favor.to = null;
                GameRoom.hideOverlay();
            }
            
            if (currentUser.id === from.id) {
                //Current user did the favor. 
                main.gameData.favor.from = null;
                GameRoom.hideOverlay();
            }
        
        } else if (data.hasOwnProperty('error')) {
            GameRoom.logMessage('Error: ' + data.error);
        }
    });
    
    /**
     * Get the card ids from the dom data of cards
     * @param   {Object} data The card DOM data
     * @returns {Array}  An array of card ids
     */
    var cardIdsFromDOMData = function(data) {
        var cards = [];
        data.each(function(index, element) {
            cards.push($(this).data('id'));
        });
        return cards;
    };
    
    /**
     * Toggle the selected attribute on cards
     * @param {Object} card The card dom
     */
    var toggleCardSelected = function(card) {
        //Get select and invert
        var selected = card.attr("data-selected") === 'true'; 
        selected = !selected;

        if (selected) {
            card.addClass('card-selected');
        } else {
            card.removeClass('card-selected');
        }
        
        card.attr("data-selected", selected.toString());
    }
    
    /**
     * Force the game host to be ready
     * @param {Object} game The game
     */
    var forceGameHostReady = function(game) {
        //Check if the current user is host, if they are then don't allow them to be not ready
        var user = main.getCurrentUser();
        if (user && game && game.isGameHost(user)) {
            var player = game.getPlayer(user);
            if (player && !player.ready) {
                io.emit($C.GAME.PLAYER.READY, { gameId: game.id});
            }
        }
    }
    
    /**
     * Create a game from data
     * @param   {Object}   data The data
     * @returns {Object} A game object
     */
    var gameFromData = function(data) {
        var players = [];
        
        //Add players
        $.each(data.players, function(index, player) {
            var user = main.users[player.user.id];
            if (user) {
                players.push(new Player(user.id, player.alive, player.ready, player.drawAmount));
            }
        });
        
        return new Game(data.id, data.title, data.status, players, data.currentPlayerIndex);
    }

});
