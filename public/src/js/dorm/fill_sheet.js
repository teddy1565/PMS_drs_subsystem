var unsaved = false;
var group_data = null;
window.onload = function(){
  get( { url: "/api/v1/shsd/drs_group" }, applyGroupSelector );
  updateSheetForm();

  document.querySelector("#scanner").onclick = scannerView;

}

window.addEventListener("beforeunload", function (e) {
  if( !unsaved )
    return undefined;
  var confirmationMessage = `尚有資料還未存檔，確定要離開嗎?`;

  (e || window.event).returnValue = confirmationMessage; //Gecko + IE
  return confirmationMessage; //Gecko + Webkit, Safari, Chrome etc.
});


async function scan_nfc_tag( target ){
  if ("NDEFReader" in window) {
    const ndef = new NDEFReader();
    try {
      await ndef.scan();
      ndef.onreading = (event) => {
        let t = target;
        let serialNumber = event.serialNumber.replace(/:/g, '').toUpperCase();
        // document.querySelector( t['name'] )[t['value']] = serialNumber;
        if( t['func'] != undefined )
          t['func']( serialNumber );
      }
    } catch(error) {
      alert( error );
      console.log(error);
    }
  } else {
    console.log("Web NFC is not supported.");
  }
}

function scannerView( ){
  if (!("NDEFReader" in window))
    return alert("該裝置不支援掃描");
  document.querySelector(".scanner-block").classList.add("scanner-block-enable");
  document.querySelector(".scanner-block").classList.remove("scanner-block-disable");

  document.querySelector("#scan-head").innerText = "等待掃描";
  document.querySelector("#scan-body").innerText = "...";
  document.querySelector('#scan-add').onclick = () => { alert("尚未掃描") };
  document.querySelector("#scan-cancel").onclick = ( ) => {
    document.querySelector(".scanner-block").classList.remove("scanner-block-enable");
    document.querySelector(".scanner-block").classList.add("scanner-block-disable");
  }

  scan_nfc_tag( {
    name:'#scan-head',
    value:'value',
    func: ( uid ) => {
      let uri = `/api/v1/shsd/nfc_tag/${uid}`

      fetch(uri, {method:"GET"}).then( res => {
        if( res.status == 401 ){
          alert("登入憑證失效");
          return location.href = "/";
        }
        res.json().then( data  => {
          let gd = (group_data.find( v=>v.dgs_id == data.form_id ) || {dgs_id:0, name:"未找到"});
          document.querySelector("#scan-head").innerText = data.tag_name;
          document.querySelector("#scan-body").innerText = `${gd.dgs_id} - ${gd.name}`;
          document.querySelector('#scan-add').onclick = () => {

            document.querySelector("#scan-head").innerText = "等待掃描";
            document.querySelector("#scan-body").innerText = "...";
            document.querySelector('#scan-add').onclick = () => { alert("尚未掃描") };
            document.querySelector(".scanner-block").classList.remove("scanner-block-enable");
            document.querySelector(".scanner-block").classList.add("scanner-block-disable");
            document.groupSelector.onsubmit( { group: gd.dgs_id } );
          }
        });
      })
    }
  } );

}

function search_nfc_tag( uid ){
  let uri = `/api/v1/shsd/nfc_tag/${uid}`;
  fetch( uri, {
    method:"GET"
  }).then( res => {
    if( res.state == 401 ){
      alert("登入失效");
      return location.href = '/';
    }
    res.json().then( data => {
      if( data.e ){
        document.querySelector('#scan-name').innerText = `${data.e}`;
      }else{
        document.querySelector('#scan-name').innerText = `名稱: ${data['tag_name']}`;
      }
    } );
  });
}

function updateSheetForm(){
  let uid = location.href.split("/").pop();
  request( `/api/v1/dorm/sheet/${ uid }`, {
    method: "GET"
  }).then( data => {
    if( !data.e ){
      return applySheetColumns( data );
    }else{
      return alert("Loading failed!");
    }
  } );
}

function applySheetColumns( data ){
  let form = document.checklist;
  form.innerHTML = "";
  let block = createElement( "div", {className: "drag-block"} );
  for( let i = 0 ; i < data.length ; i++ ){
    let d = data[ i ];
    let chunk = createElement("div", { className: "info-block drag-items", title:"拖動可調換順序" });
    chunk.draggable = true;
    
    // "G"+d.form_id+" - "+d.title  → Original method
    // `G${d.form_id} - ${d.title}` → Javascript ES6
    // "G$d.form_id - $d.title" → PHP 
    // console.log( d );
    let head = createElement("div", {className:"row item-head"});
    let idlen = -(data.length > 9 ? 2 : 1);
    let order_id = ( i + 1 ); //d.order_id == 0 ? (i+1) : d.order_id;
    let oid   = ("0"+(order_id)).substr( idlen ); // order id
    // console.log( idlen );
    head.appendChild( 
      createElement("span",  { innerText:`(${oid}) G${d.form_id} - ${d.title}`, className:"title lead px-2 col-11" })
      // createElement("div", {className:"col-8"}).appendChild(
      // )
    );
    head.appendChild(
      createElement("span", {className:"close-btn col-1", onclick: removeThisItem })
      // createElement("div", {className:"col-2"}).appendChild(
      // )
    );

    chunk.appendChild( head );
    chunk.appendChild(createElement("input", { type:"hidden", name:"colid[]", value:d.col_id, className:"db" }))
    chunk.appendChild(createElement("input", { type:"hidden", name:"newid[]", value:order_id, className:"db" }))
    chunk.appendChild(createElement("input", { placeholder: "狀態", name:"state[]", className:"db form-control pt-a", value: (d.state || ""), oninput: formGlobalCheck }));
    chunk.appendChild(createElement("input", { placeholder: "備註", name:"notes[]", className:"db form-control pt-a", value: (d.notes || ""), oninput: formGlobalCheck }));
    block.appendChild( chunk );
  }
  form.appendChild( block );

  let controlBtn = createElement("div", {className:"sheet-submit-control"})
  controlBtn.appendChild(
    data.length == 0
      ? createElement("h1", {innerText:"No Data"})
      : createElement("button", {className:"btn btn-success pt-a sheet-submit-btn form-control", innerText:"送出"}) 
  )
  form.appendChild( controlBtn );

  form.onsubmit = ( callback ) => {
    let uri = `/api/v1${location.pathname}`;
    let dataElement = document.querySelectorAll('.db');
    let data = new Object(); // { 'colid[]': [], 'state[]': [], 'notes[]': [] };
    for( let i = 0 ; i < dataElement.length ; i += 4 ){
      let column = dataElement[ i ],
          status = dataElement[i+1],
          note   = dataElement[i+2],
          newid  = dataElement[i+3];
      
      data[ column.name ] = data[ column.name ] || [];
      data[ newid.name  ] = data[ newid.name  ] || [];
      data[ status.name ] = data[ status.name ] || [];
      data[  note.name  ] = data[  note.name  ] || [];

      data[ column.name ].push( column.value );
      data[ newid.name  ].push( newid.value  );
      data[ status.name ].push( status.value );
      data[  note.name  ].push( note.value   );
    }
    form.innerHTML = "<h1>Loading...</h1>"
    request(uri, {
      headers: { 'Content-Type': 'application/json' },
      method: "PUT",
      body: JSON.stringify( data )
    }).then( (res) => {
      unsaved = false;
      updateSheetForm();
    } )

    return false;
  }

  if( !mobileDetect( ) )
    dragItems();
}

function formGlobalCheck( ){
  unsaved = true;
  this.classList.add( "unsaved" );
  console.log( this );
}

function dragItems( ){
  const draggables = document.querySelectorAll('.drag-items');
  const containers = document.querySelectorAll('.drag-block');

  draggables.forEach(draggable => {
    draggable.addEventListener('dragstart', () => {
      draggable.classList.add('dragging')
    });
  
    draggable.addEventListener('dragend', () => {
      draggable.classList.remove('dragging')
      updateNewColumnsID();
    });
  });
  
  containers.forEach(container => {
    container.addEventListener('dragover', e => {
      e.preventDefault()
      const afterElement = getDragAfterElement(container, e.clientY)
      const draggable = document.querySelector('.dragging')

      if (afterElement == null) {
        container.appendChild(draggable);
      } else {
        container.insertBefore(draggable, afterElement)
      }
    })
  })


}

function getDragAfterElement( container, y ){
  const draggableElements = [...container.querySelectorAll('.drag-items:not(.dragging)')]

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect()
    const offset = y - box.top - box.height / 4
    if (offset < 0 && offset > closest.offset) {
      unsaved = true;
      return { offset: offset, element: child }
    } else {
      return closest
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element
}

function updateNewColumnsID( ){
  let uid_list = [];
  let nid = document.querySelectorAll('[name="newid[]"]');
  for(let el of nid){
    uid_list.push( parseInt( el.value ) );
    // console.log( el.value );
  }
  let list = uid_list.slice().sort((a,b)=>a>b);
  for( let i = 0 ; i < nid.length ; i++ ){
    nid[ i ].value = list[ i ];
  }
  // let list = uid_list.sort((a,b)=>a>b);
  // console.log( list, uid_list );
}


function closest( el, target, params ){
  params = params || { };
  while( el != null ){
    // console.log( el );
    if(  el.tagName.toLowerCase() == target.toLowerCase() ){
      let keys = Object.keys( params );
      let same = true && keys.length > 0;
      for(let key of keys){
        if( el[ key ].indexOf( params[ key ] ) == -1 ){
          same = false;
          // console.log( key );
        }
      }
      if( same )
        return el;
    }
    el = el.parentElement;
  }
  return el;
}

function removeThisItem( el = undefined ){
  let uri = `/api/v1${location.pathname}`;
  let block = closest( this, "div", {className:"info-block"} );

  let dataElement = document.querySelectorAll('.db');
  let data = new Object(); // { 'colid[]': [], 'state[]': [], 'notes[]': [] };
  for( let i = 0 ; i < dataElement.length ; i += 4 ){
    let column = dataElement[ i ],
        status = dataElement[i+1],
        note   = dataElement[i+2],
        newid  = dataElement[i+3];
    
    data[ column.name ] = data[ column.name ] || [];
    data[ newid.name  ] = data[ newid.name  ] || [];
    data[ status.name ] = data[ status.name ] || [];
    data[  note.name  ] = data[  note.name  ] || [];

    data[ column.name ].push( column.value );
    data[ newid.name  ].push( newid.value  );
    data[ status.name ].push( status.value );
    data[  note.name  ].push( note.value   );
  }
  // form.innerHTML = "<h1>Loading...</h1>"
  request(uri, {
    headers: { 'Content-Type': 'application/json' },
    method: "PUT",
    body: JSON.stringify( data )
  }).then( (res) => {
    if( block != null ){
      let title = block.querySelector('span.title').innerText;
      let colid = block.querySelector('[name="colid[]"]').value;
      console.log( "remove this item", colid );
      Swal.fire({
        title,
        icon: 'warning',
        html: `確定要刪除此項目嗎`,
        showCloseButton: true,
        showCancelButton: true,
        focusConfirm: false,
        confirmButtonText: '刪除',
        confirmButtonAriaLabel: '刪除！',
        cancelButtonText: '取消'
      }).then( res => {
        if( res.isConfirmed ){
          request(uri, {
            headers: { 'Content-Type': 'application/json' },
            method:"DELETE",
            body: JSON.stringify( { col: colid } )
          }).then( ( res ) => {
            if( res.e != undefined ){
              return alert("Failed!");
            }else{
              unsaved = false;
              return updateSheetForm();
            }
          });
        }
      });
  
    }
  } )

}

function dragStart( e ){
  let index = 0;
}

function applyGroupSelector( json ){
  let form = document.groupSelector;
  group_data = json;
  form.sel_group.innerHTML = "";
  // let optGroup = createElement("optgroup", {label:"請選擇一個項目"});
  form.sel_group.appendChild( createElement("option", { innerText:"請選擇一個項目", hidden:true}) );
  for( let obj of json ){
    console.log( obj );
    form.sel_group.appendChild( createElement("option", {
      innerText: `${obj.dgs_id} - ${obj.name} ${obj.visible==0 ? "(QR Code)" : ""}`,
      value: obj.dgs_id,
      disabled: obj.visible==0,
    }));
  }

  document.groupSelector.onsubmit = function( data ){
    data = data.isTrusted ? { group: this.sel_group.value } : data
    let body = JSON.stringify( data );
    let uri = `/api/v1${location.pathname}`;

    if( unsaved == true && !confirm("您尚未存檔, 確定要新增項目？") ){
      // alert("資料已新增");
    }else{
      request(uri, {
        headers:{
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        method: this._method.value, 
        body
      }).then( ( res ) => {
        if( res.e )
          alert( res.e );
        updateSheetForm();
        // alert( JSON.stringify(res) );
      } );
    }
    return false;
  }
}

// just using for transfer data into json
function request( url, opt ){
  return fetch( url, opt ).then( res => res.json() );
}

function get( opt, callback ){
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = ( ) => {
    // console.log( xhr.readyState, xhr.status );
    if( xhr.readyState == 4 && (xhr.status == 200 || xhr.status == 304)){
      callback( JSON.parse(xhr.responseText) );
    }
    else if( xhr.readyState == 4 ){
      callback( { error:"Failed", code: xhr.status } );
    }
  }
  xhr.open("GET", opt.url, true);
  xhr.send();
}