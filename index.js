/**
 *	BATTLE.RIP
 *	https://battle.rip
 * 
 *	MADE BY XEMAH
 *	https://xemah.com
 *
**/

process.on('uncaughtException', (error) => {
	console.error(error);
});

process.on('unhandledRejection', (error) => {
	console.error(error);
});

String.prototype.capitalize = function() {
	return this.replace(/([^\W_]+[^\s-]*) */g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

String.prototype.replaceAll = function(search, replacement) {
	return this.split(search).join(replacement);
};

require('./init.js');