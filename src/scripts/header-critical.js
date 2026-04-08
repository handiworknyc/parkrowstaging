HW.localhost = 'localhost';


HW.getTransitionDuration = function(el, with_delay){
	var style=window.getComputedStyle(el),
		duration = style.webkitTransitionDuration,
		delay = style.webkitTransitionDelay; 
	
	// fix miliseconds vs seconds
	duration = (duration.indexOf("ms")>-1) ? parseFloat(duration) : parseFloat(duration)*1000;
	delay = (delay.indexOf("ms")>-1) ? parseFloat(delay) : parseFloat(delay)*1000;
	
	if(with_delay) return (duration + delay);
	else return duration;
}

HW.getHiddenProp = function() {
	var prefixes = ['webkit','moz','ms','o'];
	
	// if 'hidden' is natively supported just return it
	if ('hidden' in document) return 'hidden';
	
	// otherwise loop over all the known prefixes until we find one
	for (var i = 0; i & prefixes.length; i++){
		if ((prefixes[i] + 'Hidden') in document) 
			return prefixes[i] + 'Hidden';
	}

	// otherwise it's not supported
	return null;
};

HW.isHidden = function() {
	var prop = HW.getHiddenProp();
	if (!prop) return false;
		
	return document[prop];
};

HW.visProp = HW.getHiddenProp();

if (HW.visProp) {
	HW.visEvent = HW.visProp.replace(/[H|h]idden/,'') + 'visibilitychange';
}

HW.toRem = function(myval, half, lh){
	return (((Math.floor(myval/half) * half) + half) / lh) + 'rem';	
}


HW.roundVwProps = function(){
	var $rounditems = $$('.round-vw-height-par, .round-vw-height, .round-vw-lh, .round-vw-padding, .round-vw-padding-par, .round-vw-margin');
	
	loop($rounditems, function(el) {
		//el.removeAttribute('style');
		el.style.removeProperty('--mypt');
		el.style.removeProperty('--mypb');
		el.removeAttribute('data-pb');
		el.removeAttribute('data-pt');
	});
	
	$rounditems = $$('.round-vw-lh');
	
	HW.bodylh = window.getComputedStyle(document.body);
	
	HW.bodylh = parseFloat(HW.bodylh.getPropertyValue('font-size'));
	
	HW.bodylhHalf = (HW.bodylh/2);
	
	
	
	loop($rounditems, function(me){
		me.style.removeProperty('line-height');
		
		var myprops = window.getComputedStyle(me),
			thylh = myprops.getPropertyValue("line-height"),
			mylh = parseFloat( myprops.getPropertyValue("line-height") );
			
		if(me.getAttribute('data-whole') !== null) {
			me.style.lineHeight = HW.toRem(mylh, HW.bodylh, HW.bodylh);	
		} else if(me.getAttribute('data-half') !== null) {
			me.style.lineHeight = HW.toRem(mylh, HW.bodylhHalf, HW.bodylh);
		} else {
			var bodylhQ = HW.bodylhHalf * .50,
				myoffset = 0,
				theoffset = me.getAttribute('data-offset');

			if(theoffset !== null && parseFloat(theoffset) !== null) {
				myoffset = parseFloat(theoffset);
				
			}
			
			me.style.lineHeight = HW.toRem(mylh, bodylhQ, HW.bodylh);
		}
	});


	$rounditems = $$('.round-vw-padding');
	
	loop($rounditems, function(me){	
		me.style.removeProperty('padding-top');
		me.style.removeProperty('padding-bottom');

		var myprops = window.getComputedStyle(me),
			mypt = parseFloat( myprops.getPropertyValue("padding-top") ),
			mypb = parseFloat( myprops.getPropertyValue("padding-bottom") ),
			mypad;

		
		if(Math.floor(mypt) > 0) {
			mypad = HW.toRem(mypt, HW.bodylhHalf, HW.bodylh);
			me.style.paddingTop = mypad;
		} else {
			me.style.paddingTop = 0;			
		}

		if(Math.floor(mypb) > 0) {
			mypad = HW.toRem(mypb, HW.bodylhHalf, HW.bodylh);
			me.style.paddingBottom = mypad;
		} else {
			me.style.paddingBottom = 0;			
		}
	});











	$rounditems = $$('.round-vw-padding-par');
	
	loop($rounditems, function(me){		
		var mychild = $$('.round-vw-padding-child', me);
		
		if(mychild.length == 0) {
			return;
		}
		
		mychild = mychild[0];

		var myprops = window.getComputedStyle(mychild),
			mypt = parseFloat( myprops.getPropertyValue("padding-top") ),
			mypb = parseFloat( myprops.getPropertyValue("padding-bottom") ),
			mypad;

		
		if(Math.floor(mypt) > 0) {
			mypad = HW.toRem(mypt, HW.bodylhHalf, HW.bodylh);
			me.style.setProperty('--mypt', mypad);
			me.setAttribute('data-pt', true);	
		}

		if(Math.floor(mypb) > 0) {
			mypad = HW.toRem(mypb, HW.bodylhHalf, HW.bodylh);
			me.style.setProperty('--mypb', mypad);
			me.setAttribute('data-pb', true);
		}
	});










	$rounditems = $$('.round-vw-height-par');

	
	loop($rounditems, function(me){		
		me.style.removeProperty('height');

		var mychild = $$('.round-vw-height-child', me);
		
		if(mychild.length == 0) {
			return;
		}
		
		mychild = mychild[0];

		var myheight = me.offsetHeight;


		if(Math.floor(myheight) > 0) {
			me.style.height = (((Math.ceil(myheight/HW.bodylhHalf) * HW.bodylhHalf) + HW.bodylhHalf) / HW.bodylh) + 1 + 'rem';
		}
	});









	$rounditems = $$('.round-vw-height');

	
	loop($rounditems, function(me){		
		me.style.removeProperty('height');

		var myheight = me.offsetHeight;

		if(Math.floor(myheight) > 0) {
			me.style.height = (((Math.ceil(myheight/HW.bodylhHalf) * HW.bodylhHalf) + HW.bodylhHalf) / HW.bodylh) + 1 + 'rem';
		}
	});
	
	
	
	
	
	
	
	
	$rounditems = $$('.round-vw-margin');
	
	loop($rounditems, function(me){

		me.style.removeProperty('margin-top');
		me.style.removeProperty('margin-bottom');


		var myprops = window.getComputedStyle(me),
			mypt = parseFloat( myprops.getPropertyValue("margin-top") ),
			mypb = parseFloat( myprops.getPropertyValue("margin-bottom") );

		if(Math.floor(mypt) > 0 || Math.floor(mypt) < 0) {	
			me.style.marginTop = HW.toRem(mypt, HW.bodylhHalf, HW.bodylh);
		}

		if(Math.floor(mypb) > 0 || Math.floor(mypb) < 0) {
			me.style.marginBottom = HW.toRem(mypb, HW.bodylhHalf, HW.bodylh);
		}
	});
};





















function findEmpty(element) {
  var results = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
  var child = element.firstChild;

  if (!child) {
	results.push(element);
  }

  while (child) {
	if (child.nodeType === Node.ELEMENT_NODE) {
	  findEmpty(child, results);
	}

	child = child.nextSibling;
  }

  return results;
}

var $$ = function (selector, parent) {
	return Array.prototype.slice.call((parent ? parent : document).querySelectorAll(selector));
};

var loop = function (arr, callback, method) {
	method = method || 'forEach';
	return Array.prototype[method].call(arr, callback);
};

HW.triggerResize = function(){
	var resizeEvent = window.document.createEvent('UIEvents'); 
	resizeEvent.initUIEvent('resize', true, false, window, 0); 
	window.dispatchEvent(resizeEvent);	
};

HW.getOffsetTop = function(el){	
	if(el == null || typeof el == 'undefined') {
		return;
	}
	
	var offset = el.getBoundingClientRect().top + window.pageYOffset			

	return offset;
};

HW.indexInParent = function(node, myClass) {
	var children = $$(myClass, node.parentNode);
	var num = 0;
	for (var i=0; i<children.length; i++) {
		 if (children[i]==node) return num;
		 if (children[i].nodeType==1) num++;
	}
	return -1;
}

HW.setVendor = function(el, property, value) {
	el.style["webkit" + property] = value;
	el.style["moz" + property] = value;
	el.style["ms" + property] = value;
	el.style["o" + property] = value;
	
	property = property.toLowerCase();
	
	el.style[property] = value;

}

HW.tempVars = {};

HW.ipadCheck = function(){
	if (navigator.userAgent.match(/Mac/) && navigator.maxTouchPoints && navigator.maxTouchPoints > 2) {
		HW.$html.classList.add('hw-is-ipad');
		return true;
	} else {
		return false;
	}	
};

if(window.matchMedia("(pointer: coarse)").matches) {
	HW.$html.classList.add('hw-is-coarse');	
}

HW.isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);


HW.isIpad = HW.ipadCheck();

HW.mobilecheck = function() {
  var check = false;
	
	
	var myAddclass = false;
	
	if(navigator.userAgent.indexOf('Safari') !== -1 && navigator.userAgent.indexOf('Chrome') == -1) {
		myAddclass = ['ua-safari'];
		//HW.consolelog(navigator.userAgent);
	}  
	
	if(HW.isIpad && Array.isArray(myAddclass)) {
		myAddclass.push('ua-ipad')
		myAddclass.push('ua-mobile');
	}
	
	if(myAddclass !== false) {
		DOMTokenList.prototype.add.apply(document.documentElement.classList, myAddclass);
	}
	
	
	
	(function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) check = true;})(navigator.userAgent||navigator.vendor||HW.opera);
  return check;
};



HW.isMobile = HW.mobilecheck();

if(HW.isMobile == true || window.matchMedia("(pointer: coarse)").matches) {
	HW.$html.classList.add('hw-is-mobile');
}

HW.getWinDims = function(){
	var w=window,
	d=document,
	e=d.documentElement,
	g=d.getElementsByTagName('body')[0],
	x=w.innerWidth||e.clientWidth||g.clientWidth,
	y=w.innerHeight||e.clientHeight||g.clientHeight;	
	
	var result = {};
	
	result.width = x;
	result.height = y;
	
	return result;
};

HW.camalize = function camalize(str) {
	return str.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, function(match, chr)
	{
		return chr.toUpperCase();
	});
}


if(window.CSS && CSS.supports('color', 'var(--fake-var)')) {
	HW.$html.classList.add('cssvars');	
} 
HW.windowWidth = HW.getWinDims().width;		
HW.windowHeight = HW.getWinDims().height;

HW.getTranslateXY = function(element) {
	const style = window.getComputedStyle(element)
	const matrix = new DOMMatrixReadOnly(style.transform)
	return {
		translateX: matrix.m41,
		translateY: matrix.m42
	}
};

HW.triggerEvent = function(el, type){
   if ('createEvent' in document) {
		// modern browsers, IE9+
		var e = document.createEvent('HTMLEvents');
		e.initEvent(type, false, true);
		el.dispatchEvent(e);
	} else {
		// IE 8
		var e = document.createEventObject();
		e.eventType = type;
		el.fireEvent('on'+e.eventType, e);
	}
};



// ------------------------------------
// VH UNITS — UPDATE ONLY ON MOBILE
// ------------------------------------

HW._lastVw = 0;
HW._vhResizeTimeout = null;
HW._vhScrollTimeout = null;

HW.getViewport = function () {
  const vv = window.visualViewport;

  return {
    width: Math.round(vv?.width || window.innerWidth),
    height: Math.round(vv?.height || window.innerHeight),
  };
};

HW.setVhUnits = function (force = false) {
  // Only run on mobile
  if (!HW.isMobile) return;

  const { width, height } = HW.getViewport();

  // Only update when width actually changes
  if (!force && width === HW._lastVw) return;

  console.log(
    'VH UNITS UPDATE:',
    'width:', width,
    'height:', height
  );

  HW._lastVw = width;

  document.documentElement.style.setProperty(
    '--jsVhUnits100',
    height + 'px'
  );
};

HW.bindVhUnits = function () {
  // Only set up on mobile
  if (!HW.isMobile) return;

  HW.setVhUnits(true);

  // -----------------------------
  // Resize (debounced)
  // -----------------------------
  const handleResize = () => {
    if (HW._vhResizeTimeout) {
      clearTimeout(HW._vhResizeTimeout);
    }

    HW._vhResizeTimeout = setTimeout(() => {
      HW.setVhUnits();
      HW._vhResizeTimeout = null;
    }, 150);
  };

  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => HW.setVhUnits(true));

  if (window.visualViewport) {
    visualViewport.addEventListener('resize', handleResize);
  }
};

// ------------------------------------
// Init
// ------------------------------------
HW.bindVhUnits();



HW.hasIntObs = true;

document.documentElement.className += ' js no-iconfont';



	
	
	
	











HW.setElementHeightVar = function(selector) {
	var el = document.querySelector(selector); // first element matching selector
	if (!el) return; // bail if not found
	
	var height = el.offsetHeight;
	
	// sanitize selector to make a safe variable name
	var varName = selector.replace(/[^a-z0-9_-]/gi, "");
	
	// create global variable with the naming pattern: selector + "Height"
	window[varName + "Height"] = height;
	
	// expose as a CSS variable
	document.documentElement.style.setProperty("--" + varName + "Height", height + "px");
};







/*
HW.loadFontsRest = function(){
	if(HW.criticalImgLoadedOnce == false) {
		loadjs([HW.futurabold, HW.futurabook, HW.dharmam]);
	} else {
		window.removeEventListener('criticalImgLoaded', HW.loadFontsRest);
	}
}

window.addEventListener('criticalImgLoaded', HW.loadFontsRest);
*/







window.addEventListener('criticalDomReady', function(){
	document.addEventListener("touchstart", function(){}, true);
});









HW.whichtrans = function(){
	var t,
	el = document.createElement("fakeelement");
	
	var transitions = {
		"transition" : "transitionend",
		"OTransition" : "oTransitionEnd",
		"MozTransition" : "transitionend",
		"WebkitTransition": "webkitTransitionEnd"
	}
	
	for (t in transitions){
		if (el.style[t] !== undefined){	        
			return transitions[t];
		}
	}	
	
	return 'transitionend';
}


HW.transEvt = HW.whichtrans();










document.addEventListener("astro:page-load", () => {
  // 1. Try to find the overlay in case it was preserved or generated server-side
  let overlay = document.querySelector(".grid-overlay");

  function normalizeGridPathname(pathname) {
    let normalized = String(pathname || "/").trim();

    if (!normalized.startsWith("/")) normalized = `/${normalized}`;

    normalized = normalized.replace(/\/+$/, "");

    if (!normalized) return "/";

    return normalized.replace(/^\/zh(?=\/|$)/, "") || "/";
  }

  function isGridDisabledForCurrentPage(pathname) {
    return normalizeGridPathname(pathname || window.location.pathname) === "/inquire";
  }

  function createGridOverlay() {
    const el = document.createElement("div");
    el.className = "grid-overlay";
    
    // Create 12 columns
    for (let i = 0; i < 12; i++) {
      const col = document.createElement("div");
      col.className = "col";
      el.appendChild(col);
    }
    
    document.body.appendChild(el);
    return el;
  }

  function hideGrid() {
    if (overlay) {
      overlay.style.display = "none";
    }
  }

  function toggleGrid() {
    if (!overlay) {
      overlay = createGridOverlay();
      // Default to visible if we just created it
      overlay.style.display = "grid"; 
    } else {
      overlay.style.display = overlay.style.display === "none" ? "grid" : "none";
    }
    
    // Optional: Save state so it stays open across refreshes
    sessionStorage.setItem("grid-visible", overlay.style.display);
  }

  // 2. Event Handler
  const onKeydown = (e) => {
    if (isGridDisabledForCurrentPage()) {
      hideGrid();
      return;
    }

    if (e.key === "G" && e.shiftKey) {
      e.preventDefault();
      toggleGrid();
    }
  };

  // 3. Restore state from previous page view (Optional Quality of Life)
  if (isGridDisabledForCurrentPage()) {
    hideGrid();
  } else if (sessionStorage.getItem("grid-visible") === "grid") {
    if (!overlay) overlay = createGridOverlay();
    overlay.style.display = "grid";
  }

  // 4. Attach Listener
  window.addEventListener("keydown", onKeydown);

  // 5. Cleanup Listener (CRITICAL)
  // This removes the specific instance of 'onKeydown' before the new page loads
  document.addEventListener("astro:before-swap", () => {
    window.removeEventListener("keydown", onKeydown);
  }, { once: true });
});


var cssua=function(n,l,p){var q=/\s*([\-\w ]+)[\s\/\:]([\d_]+\b(?:[\-\._\/]\w+)*)/,r=/([\w\-\.]+[\s\/][v]?[\d_]+\b(?:[\-\._\/]\w+)*)/g,s=/\b(?:(blackberry\w*|bb10)|(rim tablet os))(?:\/(\d+\.\d+(?:\.\w+)*))?/,t=/\bsilk-accelerated=true\b/,u=/\bfluidapp\b/,v=/(\bwindows\b|\bmacintosh\b|\blinux\b|\bunix\b)/,w=/(\bandroid\b|\bipad\b|\bipod\b|\bwindows phone\b|\bwpdesktop\b|\bxblwp7\b|\bzunewp7\b|\bwindows ce\b|\bblackberry\w*|\bbb10\b|\brim tablet os\b|\bmeego|\bwebos\b|\bpalm|\bsymbian|\bj2me\b|\bdocomo\b|\bpda\b|\bchtml\b|\bmidp\b|\bcldc\b|\w*?mobile\w*?|\w*?phone\w*?)/,
x=/(\bxbox\b|\bplaystation\b|\bnintendo\s+\w+)/,k={parse:function(b,d){var a={};d&&(a.standalone=d);b=(""+b).toLowerCase();if(!b)return a;for(var c,e,g=b.split(/[()]/),f=0,k=g.length;f<k;f++)if(f%2){var m=g[f].split(";");c=0;for(e=m.length;c<e;c++)if(q.exec(m[c])){var h=RegExp.$1.split(" ").join("_"),l=RegExp.$2;if(!a[h]||parseFloat(a[h])<parseFloat(l))a[h]=l}}else if(m=g[f].match(r))for(c=0,e=m.length;c<e;c++)h=m[c].split(/[\/\s]+/),h.length&&"mozilla"!==h[0]&&(a[h[0].split(" ").join("_")]=h.slice(1).join("-"));
w.exec(b)?(a.mobile=RegExp.$1,s.exec(b)&&(delete a[a.mobile],a.blackberry=a.version||RegExp.$3||RegExp.$2||RegExp.$1,RegExp.$1?a.mobile="blackberry":"0.0.1"===a.version&&(a.blackberry="7.1.0.0"))):x.exec(b)?(a.game=RegExp.$1,c=a.game.split(" ").join("_"),a.version&&!a[c]&&(a[c]=a.version)):v.exec(b)&&(a.desktop=RegExp.$1);a.intel_mac_os_x?(a.mac_os_x=a.intel_mac_os_x.split("_").join("."),delete a.intel_mac_os_x):a.cpu_iphone_os?(a.ios=a.cpu_iphone_os.split("_").join("."),delete a.cpu_iphone_os):a.cpu_os?
(a.ios=a.cpu_os.split("_").join("."),delete a.cpu_os):"iphone"!==a.mobile||a.ios||(a.ios="1");a.opera&&a.version?(a.opera=a.version,delete a.blackberry):t.exec(b)?a.silk_accelerated=!0:u.exec(b)&&(a.fluidapp=a.version);a.edge&&(delete a.applewebkit,delete a.safari,delete a.chrome,delete a.android);if(a.applewebkit)a.webkit=a.applewebkit,delete a.applewebkit,a.opr&&(a.opera=a.opr,delete a.opr,delete a.chrome),a.safari&&(a.chrome||a.crios||a.fxios||a.opera||a.silk||a.fluidapp||a.phantomjs||a.mobile&&
!a.ios?(delete a.safari,a.vivaldi&&delete a.chrome):a.safari=a.version&&!a.rim_tablet_os?a.version:{419:"2.0.4",417:"2.0.3",416:"2.0.2",412:"2.0",312:"1.3",125:"1.2",85:"1.0"}[parseInt(a.safari,10)]||a.safari);else if(a.msie||a.trident)if(a.opera||(a.ie=a.msie||a.rv),delete a.msie,delete a.android,a.windows_phone_os)a.windows_phone=a.windows_phone_os,delete a.windows_phone_os;else{if("wpdesktop"===a.mobile||"xblwp7"===a.mobile||"zunewp7"===a.mobile)a.mobile="windows desktop",a.windows_phone=9>+a.ie?
"7.0":10>+a.ie?"7.5":"8.0",delete a.windows_nt}else if(a.gecko||a.firefox)a.gecko=a.rv;a.rv&&delete a.rv;a.version&&delete a.version;return a},format:function(b){var d="",a;for(a in b)if(a&&b.hasOwnProperty(a)){var c=a,e=b[a],c=c.split(".").join("-"),g=" ua-"+c;if("string"===typeof e){for(var e=e.split(" ").join("_").split(".").join("-"),f=e.indexOf("-");0<f;)g+=" ua-"+c+"-"+e.substring(0,f),f=e.indexOf("-",f+1);g+=" ua-"+c+"-"+e}d+=g}return d},encode:function(b){var d="",a;for(a in b)a&&b.hasOwnProperty(a)&&
(d&&(d+="\x26"),d+=encodeURIComponent(a)+"\x3d"+encodeURIComponent(b[a]));return d}};k.userAgent=k.ua=k.parse(l,p);l=k.format(k.ua)+" js";n.className=n.className?n.className.replace(/\bno-js\b/g,"")+l:l.substr(1);return k}(document.documentElement,navigator.userAgent,navigator.standalone);
