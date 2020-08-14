

(function () {
    const vscode = acquireVsCodeApi();

    const oldState = vscode.getState();
    
    let cyObj = (oldState && oldState.cytObj)? oldState.cytObj : cytoscape({
        container: document.getElementById('depGraph'), // container to render in     
        // elements:{
        //     nodes:[
        //         {
        //             data: {id: 'Command'},
        //         },
        //         {
        //             data: {id: 'Command2'},
        //         },
        //     ]
        // },        
        minZoom: 0.1,    
        maxZoom: 5,
        style: [ // the stylesheet for the graph
          {
            selector: 'node',
            style: {
              'background-color': 'green',
              'label': 'data(id)'
            }
          },
          {
            selector: 'node[type="Widgets"]',
            style: {
              'shape': 'square',
              'background-color': 'blue',
              'label': 'data(id)'
            }
          },
      
          {
            selector: 'edge',
            style: {
              'width': 2,
              'line-color': 'orange',
              'target-arrow-color': 'orange',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier'
            }
          }
        ],
      
        layout: {
          name: 'breadthfirst',          
        }
      
      });
        
    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {        
        
        const message = event.data;         
        let elements = {nodes:[], edges:[]};        
        if(message.mainRefs){          
            for (var commandVariables of message.mainRefs) {                
                elements.nodes.push({data: {id: commandVariables}});                
            }            
        }
        if(message.subRefs){          
          for (var widget of message.subRefs) {            
            const edId = widget.parent+widget.name;      
            elements.nodes.push({data: {id: widget.name, type: 'Widgets'}});
            elements.edges.push({data: {id: edId, source: widget.parent, target: widget.name}});
          }          
        }
        cyObj.json({elements: elements});
        cyObj.layout({name: 'breadthfirst'}).run();
        vscode.setState({cytObj: cyObj});
    });
    
}());