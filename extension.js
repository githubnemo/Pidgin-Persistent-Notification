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

/*
  Retrieved using:

  dbus-send --session --type=method_call --print-reply --dest=org.gajim.dbus \
  /org/gajim/dbus/RemoteObject org.freedesktop.DBus.Introspectable.Introspect
*/
const GajimIface = '<node name="/org/gajim/dbus/RemoteObject">\
	<interface name="org.gajim.dbus.RemoteInterface">\
		<signal name="NewMessage">\
			<arg type="av" name="account_and_array" />\
		</signal>\
	</interface>\
</node>';

const GajimProxy = Gio.DBusProxy.makeProxyWrapper(GajimIface);


// Indicator shown in the panel menu to indicate a new message.
const PersistentIndicator = new Lang.Class({
	Name: 'PersistentIndicator',
	Extends: PanelMenu.Button,

	_init: function() {
		this.parent(0, "Persistent Indicator", true);

		this.indicators = new St.BoxLayout({
			style_class: 'panel-status-indicators-box'
		});

		this.icon = new St.Icon({
			style_class: 'system-status-icon',
			icon_name: 'user-available-symbolic'
		});

		this.indicators.add_actor(this.icon);

		this.actor.add_actor(this.indicators);
	},
});


// Find all windows with the supplied application ID, e.g. 'pidgin.desktop'
function findWindowsByAppIdAndRole(appId, role) {
	let windowTracker = Shell.WindowTracker.get_default();

	return global.screen.get_active_workspace().list_windows().filter(function(w) {
		return (windowTracker.get_window_app(w).get_id() == appId &&
				w.get_role() == role);
	});
}

function focusWindow(metaWindow) {
	metaWindow.activate(global.get_current_time());
}

function matchCurrentFocusApp(appId) {
	let focusApp = Shell.WindowTracker.get_default().focus_app;

	return (focusApp != null && focusApp.get_id() == appId);
}

function IndicatorExtension() {
	return this._init();
}

IndicatorExtension.prototype = {

	_init: function() {
		this._indicator = null;
		this._purpleClient = null;
		this._gajimClient = null;
	},

	/**
	 * Entry point of the extension.
	 *
	 * Setup handlers for when Pidgin joins, is already present on,
	 * or leaves the bus.
	 */
	enable: function() {
		this._indicator = new PersistentIndicator;

		Main.panel.addToStatusArea('pidgin-persistent-notification', this._indicator, 1, 'right');

		this._purpleClient = new PurpleClient(this._indicator);
		this._gajimClient = new GajimClient(this._indicator);

		this._purpleClient.connectToPurple();
		this._gajimClient.connectToGajim();
	},

	disable: function() {
		this._indicator.destroy();

		this._purpleClient.disconnectFromPurple();
		this._gajimClient.disconnectFromGajim();
	}
}

function GajimClient(indicator) {
	this._init(indicator);
}

GajimClient.prototype = {
	_init: function(indicator) {
		this._indicator = indicator;
		this._windowUnmanagedHandle = null;
		this._windowFocusHandle = null;
		this._clickToFocusHandle = null;
	},

	connectToGajim: function() {
		this._proxy = new GajimProxy(Gio.DBus.session,
			'org.gajim.dbus', '/org/gajim/dbus/RemoteObject');

		this._newMessageHandle = this._proxy.connectSignal('NewMessage',
			Lang.bind(this, this._onNewMessage));
	},

	disconnectFromGajim: function() {
		this._proxy.disconnectSignal(this._newMessageHandle);
		this._proxy = null;

		this._removePersistentNotification();
	},

	_onGajimWindowClose: function() {
		this._removePersistentNotification();
	},

	_onGajimWindowFocus: function() {
		global.log("Removing persistent notification on request");
		this._removePersistentNotification();
	},

	_focusChatWindow: function() {
		findWindowsByAppIdAndRole('gajim.desktop', 'messages').map(function(mw) {
			focusWindow(mw);
		});
	},

	_addPersistentNotification: function() {
		this._indicator.actor.add_style_class_name('gajim-notification');
		this._clickToFocusHandle = this._indicator.actor.connect('button-press-event', Lang.bind(this, this._focusChatWindow));

		let that = this;

		findWindowsByAppIdAndRole('gajim.desktop', 'messages').map(function(mw) {
			if (that._windowUnmanagedHandle == null) {
				that._windowUnmanagedHandle = mw.connect('unmanaged', Lang.bind(that, that._onGajimWindowClose));
			}
			if (that._windowFocusHandle == null) {
				global.log("connecting focus!");
				that._windowFocusHandle = mw.connect('focus', Lang.bind(that, that._onGajimWindowFocus));
			}
		});
	},

	_removePersistentNotification: function() {
		this._indicator.actor.remove_style_class_name('gajim-notification');

		if (this._clickToFocusHandle != null) {
			this._indicator.actor.disconnect(this._clickToFocusHandle);
			this._clickToFocusHandle = null;
		}

		let that = this;

		findWindowsByAppIdAndRole('gajim.desktop', 'messages').map(function(mw) {
			if (that._windowFocusHandle != null) {
				mw.disconnect(that._windowFocusHandle);
			}
			if (that._windowUnmanagedHandle != null) {
				mw.disconnect(that._windowUnmanagedHandle);
			}
		});

		this._windowFocusHandle = null;
		this._windowUnmanagedHandle = null;
	},

	_onNewMessage: function(_emitter, _handleId, params) {
		if (!matchCurrentFocusApp("gajim.desktop")) {
			this._addPersistentNotification();
		}
	},
}

function PurpleClient(indicator) {
	this._init(indicator);
}

PurpleClient.prototype = {

	_init: function(indicator) {
		this._indicator = indicator;
		this._clickToFocusHandle = null;
	},

	/**
	 * Connect signals and wait for action.
	 */
	connectToPurple: function() {
		this._proxy = new PurpleProxy(Gio.DBus.session,
			'im.pidgin.purple.PurpleService', '/im/pidgin/purple/PurpleObject');

		this._displayedImMessageId = this._proxy.connectSignal('DisplayedImMsg',
			Lang.bind(this, this._onDisplayedImMsg));

		this._conversationUpdatedId = this._proxy.connectSignal('ConversationUpdated',
			Lang.bind(this, this._onConversationUpdated));
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

		if(!matchCurrentFocusApp('pidgin.desktop')) {
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

	/**
	 * Find the pidgin conversation window (if any) and return its MetaWindow
	 * object. The right window is identified according to the window role
	 * which is 'conversations' for the conversation window and "buddy_list"
	 * for the roster.
	 */
	_focusChatWindow: function() {
		findWindowsByAppIdAndRole('pidgin.desktop', 'conversation').map(function(mw) {
			focusWindow(mw);
		});
	},

	_addPersistentNotification: function() {
		this._indicator.actor.add_style_class_name('pidgin-notification');

		if (this._clickToFocusHandle == null) {
			this._clickToFocusHandle = this._indicator.actor.connect('button-press-event', Lang.bind(this, this._focusChatWindow));
		}
	},

	_removePersistentNotification: function() {
		this._indicator.actor.remove_style_class_name('pidgin-notification');

		if (this._clickToFocusHandle != null) {
			this._indicator.actor.disconnect(this._clickToFocusHandle);
			this._clickToFocusHandle = null;
		}
	},

	/**
	 * Disconnect the Pidgin/libpurple signal listeners and remove
	 * any notification as there's no way to reset it after disconnecting.
	 */
	disconnectFromPurple: function() {
		this._proxy.disconnectSignal(this._displayedImMessageId);
		this._proxy.disconnectSignal(this._conversationUpdatedId);
		this._proxy = null;

		this._removePersistentNotification();
	},
}


function init() {
	return new IndicatorExtension();
}
