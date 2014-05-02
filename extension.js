const Main = imports.ui.main;
const Lang = imports.lang;
const Gio = imports.gi.Gio;
const Shell = imports.gi.Shell;

const PanelMenu = imports.ui.panelMenu;
const St = imports.gi.St;

/**
 * Mostly taken from the output of
 * dbus-send --print-reply --dest=im.pidgin.purple.PurpleService \
   /im/pidgin/purple/PurpleObject org.freedesktop.DBus.Introspectable.Introspect
 */
const PurpleIface = '<node>\
	<interface name="im.pidgin.purple.PurpleInterface">\
		<signal name="DisplayedImMsg">\
			<arg type="i"/>\
			<arg type="s"/>\
			<arg type="s"/>\
			<arg type="i"/>\
			<arg type="i"/>\
		</signal>\
		<signal name="ConversationUpdated">\
		  <arg type="i"/>\
		  <arg type="u"/>\
		</signal>\
	</interface>\
</node>';

const PurpleProxy = Gio.DBusProxy.makeProxyWrapper(PurpleIface);

const PURPLE_CONV_UPDATE_UNSEEN = 4;
const PURPLE_MESSAGE_SYSTEM = 0x4;



const PersistentIndicator = new Lang.Class({
	Name: 'PersistentIndicator',
	Extends: PanelMenu.Button,

	_init: function() {
		this.parent(0.0, "Chat Indicator");

		let icon = new St.Icon({
			icon_name: 'user-available-symbolic',
			style_class: 'system-status-icon'
		});

		this.actor.add_actor(icon);
	},
});


function PurpleClient() {
	this._init();
}

PurpleClient.prototype = {

	_init: function() {
		// All DBus signals are connected and need to be disconnected
		// on disable().
		this._signalsConnected = false;

		this._indicator = null;
	},

	/**
	 * Pidgin just joined the bus. Connect signals and wait for action.
	 */
	_onPurpleAppeared: function(owner) {
		if(this._signalsConnected) {
			global.log('Pidgin appeared again. Reconnecting signals.');
			this._disconnectFromPidgin();
		}

		this._proxy = new PurpleProxy(Gio.DBus.session,
			'im.pidgin.purple.PurpleService', '/im/pidgin/purple/PurpleObject');

		this._displayedImMessageId = this._proxy.connectSignal('DisplayedImMsg',
			Lang.bind(this, this._onDisplayedImMsg));

		this._conversationUpdatedId = this._proxy.connectSignal('ConversationUpdated',
			Lang.bind(this, this._onConversationUpdated));

		this._signalsConnected = true;
	},

	/**
	 * Pidgin disappeared from the bus. We stop listening and wait for
	 * Pidgin to return.
	 */
	_onPurpleDisappeared: function(owner) {
		this._disconnectFromPidgin();
	},

	/**
	 * A message was shown in the message window. Display a persistent
	 * notification if the pidgin window is not focussed.
	 */
	_onDisplayedImMsg: function(_emitter, _handleId, params) {
		let [_account, _who, _message, _conv, flags] = params;

		if(flags & PURPLE_MESSAGE_SYSTEM) {
			return;
		}

		let focusApp = Shell.WindowTracker.get_default().focus_app;

		if(focusApp == null || focusApp.get_id() != 'pidgin.desktop') {
			this._addPersistentNotification();
		}
	},

	/**
	 * State of the conversation window has changed. Remove the persistent
	 * notification if the message was read.
	 */
	_onConversationUpdated: function(_emitter, _handleId, params) {
		let [_conv, flags] = params;

		if(PURPLE_CONV_UPDATE_UNSEEN & flags) {
			this._removePersistentNotification();
		}
	},

	_addPersistentNotification: function() {
		this._indicator.actor.add_style_class_name('pidgin-notification');
	},

	_removePersistentNotification: function() {
		this._indicator.actor.remove_style_class_name('pidgin-notification');
	},

	/**
	 * Disconnect the Pidgin signal listeners and remove any notification
	 * as there's no way to reset it after disconnecting.
	 */
	_disconnectFromPidgin: function() {
		if(!this._signalsConnected) {
			return;
		}

		this._proxy.disconnectSignal(this._displayedImMessageId);
		this._proxy.disconnectSignal(this._conversationUpdatedId);
		this._proxy = null;

		this._removePersistentNotification();

		this._signalsConnected = false;
	},

	/**
	 * Entry point of the extension.
	 *
	 * Setup handlers for when Pidgin joins, is already present on,
	 * or leaves the bus.
	 */
	enable: function() {
		this._purpleWatchId = Gio.DBus.session.watch_name(
			'im.pidgin.purple.PurpleService',
			Gio.BusNameWatcherFlags.NONE,
			Lang.bind(this, this._onPurpleAppeared),
			Lang.bind(this, this._onPurpleDisappeared)
		);

		this._indicator = new PersistentIndicator;

		Main.panel.addToStatusArea('pidgin-persistent-notification', this._indicator, 1, 'right');
	},

	disable: function() {
		if (this._indicator != null) {
			this._indicator.destroy();
		}

		if(this._signalsConnected) {
			return;
		}

		this._disconnectFromPidgin();
		Gio.DBus.session.unwatch_name(this._purpleWatchId);
	}
}


function init() {
	return new PurpleClient();
}
