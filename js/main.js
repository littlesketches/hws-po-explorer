//////////////////////////////////////////////////////////
///// MW HWS DATA EXPLORATION TOOL                  //////
///// --------------------------------------------  //////
///// Loading a copy of the HWS database structure  //////
///// to explore ways to use the information        //////
/////                                               //////
//////////////////////////////////////////////////////////

// 0. INITIALISE DATA AND SETTINGS OBJECTS

const api = {           // References for data table links for each table used (tsv published output from each separate sheet/table)
    gsTableLinks: {
        schema:          'https://docs.google.com/spreadsheets/d/e/2PACX-1vQF-0Cz3AJVmDExFGtFwr0tWFTMDGHqEmrZaNtT7w0-0Ges9Z__OkyF1FgrUaZl_CSmDPjp4BiZRw__/pub?gid=1001902305&single=true&output=tsv',
        database:        'https://docs.google.com/spreadsheets/d/e/2PACX-1vQF-0Cz3AJVmDExFGtFwr0tWFTMDGHqEmrZaNtT7w0-0Ges9Z__OkyF1FgrUaZl_CSmDPjp4BiZRw__/pub?gid=796648383&single=true&output=tsv'
    }
}

const data = {      // Object to store loaded/parsed/shaped data
    grouped:        {},
    hierarchy:      {},
    schema:         {}
}         

const settings = {      // Visualisation settings
    svgID:        'vis',
    dims: {
        height:     null, 
        width:      3840
    },
    geometry: {
        type:       'dendogram',  // 'dendogram',
        padding:    10,
        rotation:   0
    },
    layout: {                // Object to store default layout options (updated if settings are sent via query string)
    },
    lists: {
    }
}

const state = {         // Object to store application state
    user:      ''      // 
}

// 1.  VISUALISATION BUILD FUNCTION  
buildFromGSheetData(settings)

function buildFromGSheetData(settings) {
    // 2. Asynchronous data load (with Promise.all) and D3 (Fetch API): references the shared "api" object for links to specific data tables
    Promise.all(
        Object.values(api.gsTableLinks).map(link => d3.tsv(link))       // Pass in array of d3.tsv loaders with each link
    ).then( rawData => {
        // Parse data schema and table
        data.schema = parseSchema(rawData[0])
        data.table =  parseTable(rawData[1])

        return data

    }).then( async (data) => {

        // 3. Initiate vis build sequence with data now loaded
        await applyUserQuerySettings(settings)                                                          // a. Apply query string settings
        await shapeData(data.table)
        await renderVis(data.grouped, settings)
    })

    // X. Extract table schema
    const parseSchema = (fieldData) => {
        const obj = {}
        for (const fieldDatum of fieldData){
            obj[fieldDatum.dbFieldName] = {}
            for (const name of fieldData.columns){
                obj[fieldDatum.dbFieldName][name] = fieldDatum[name] 
            }
        }
        return obj
    }

    // X. Table data parsing function: trim() header white space and prase numbers with "$" and "," stripped. 
    const parseTable = (tableData) => {
        return tableData.map(row => {
            const newObj = {}
            Object.entries(row).forEach(([key, value]) => {
                const alias = data.schema[key].alias
                switch(alias){
                    case 'year':
                        newObj[alias] =  value
                        break     
                    default:
                        newObj[alias] = isNaN(parseFloat(value.replace(/\$|,/g, ''))) ? value : parseFloat(value.replace(/\$|,/g, '')) 
                }
            })
            return newObj
        })
    };   
};

    // I. Apply user options
    async function applyUserQuerySettings(settings){
        console.log('Applying query string to vis settings...')
        // i. Check for query parameters and update settings
        const queryParameters = new URLSearchParams(window.location.search)
        if (queryParameters.has('showHeader')) { 
            settings.layout.showHeader = queryParameters.get('showHeader') === 'false' ? false : true
            d3.select('.page-container').classed('hideHeader', !settings.layout.showHeader)
        }
    }; // end applyUserQuerySettings()

    // II. Reshape data
    async function shapeData(tableData){
        data.grouped = d3.group(tableData, 
            d => d.catchmentName, 
            d => d.subCatchmentName, 
            d => d.poScale, 
            d => d.poLocationName, 
            d => d.poGroup, 
            d => d.poTheme, 
        )

        data.hierarchy = d3.hierarchy(d3.group(data.grouped) )

        data.schema.levels = [
            { name: 'catchmentName',     dx: -450,      wrapLength: null },   
            { name: 'subCatchmentName',  dx: -280,      wrapLength: 300 },   
            { name: 'poScale',           dx: -250,      wrapLength: null },   
            { name: 'poLocationName',    dx: -200,      wrapLength: 250 },   
            { name: 'poGroup',           dx: -30,       wrapLength: 250 },   
            { name: 'poTheme',           dx: 200,       wrapLength: 480 },   
            { name: 'leafNode',          dx: 350,       wrapLength: 1300 }   
        ]
    }; //shapeData

    // III. Render vis
    async function renderVis(groupedData, settings){

        const root = d3.hierarchy(groupedData).sort(),
            descendants = root.descendants(),
            links = root.links()

        // Add an id for each node
        descendants.forEach((obj, i) => obj.id = `node-${i}`)
        links.forEach((obj, i) => obj.id = `link-${obj.source.id}_${obj.target.id}`)

        // Compute labels from nodes
        const labels = descendants.map(d => d.data.length && typeof d.data[0] === 'undefined' 
                ? 'HWS Catchments' 
                    : d.data.length ? d.data[0]  : `${d.data.poNumber} |  ${d.data.poDescription}`
        )

        // Compute the layout.
        const dx = 75;
        const dy = settings.dims.width / (root.height + settings.geometry.padding);
        const tree  = d3.tree()
            .separation( (a,b) => a.parent === b.parent ? 1 : 1.25 )
            .nodeSize([dx, dy])(root)
            
        // Center the tree.
        let x0 = Infinity;
        let x1 = -x0;
        root.each(d => {
            if (d.x > x1) x1 = d.x;
            if (d.x < x0) x0 = d.x;
        });

        // Compute the default height and offsets to centre the 
        settings.dims.height = x1 - x0 + dx * 2 + 500;

        const xOffset = dy * settings.geometry.padding / 2 - (settings.dims.width * 0.43), // Adjustment by prop. of width to account for root not being shown
            yOffset = x0 - dx

        const svg = d3.select(`#${settings.svgID}`)
            .attr("viewBox", [ 0, 0 , settings.dims.width, settings.dims.height])
            .attr("width", settings.dims.width)
            .attr("style", "max-width: 100%; height: auto; height: intrinsic;")
                .on('click', () => {
                    d3.select('.modal-container').classed('open', false)
                    resetNodeLinks()
                })
        const zoomArea = svg.append('g').classed('zoom-area', true)
        const chart = zoomArea.append('g').classed('group-chart', true)
            .attr('transform', `translate(${-xOffset}, ${-yOffset})`)

        // Add group of paths/links
        chart.append("g").classed('link-group', true)
            .selectAll("path")
            .data(links)
            .join("path")
                .attr('id', d => d.id)
                .attr('class', function(d){
                    const sourceNode =  d.source,
                        ancestorNodes = sourceNode.ancestors()
                    let ancestorClasses = ''
                    if(d.source && typeof d.source.data[0] !== 'undefined' ){
                        ancestorClasses = ancestorNodes
                            .filter(d => d.depth > 0)
                            .map(d => `${helpers.slugify(d.data[0])}`)
                            .toString()
                            .replace(/,/g, ' ')
                    }
                    return `link ${ancestorClasses === '' ? 'root' : ancestorClasses}`
                })
                .attr("d", d3.linkHorizontal()
                    .x(d => d.y + (d.depth === 0 ? 0 : data.schema.levels[d.depth - 1].dx) )
                    .y(d => d.x)
                );


        // Add group of nodes
        const node = chart.append("g").classed('node-group', true)
            .selectAll(".node")
            .data(descendants)
            .join("a")
                .attr('id', d => d.id)
                .attr('class', d => {
                    const classList = d.depth === 0 ? 'depth-root'
                        : (d.data.length === 2 && d.parent) ? `${helpers.slugify(d.data[0])} ${typeof d.parent.data[0] !== 'undefined' ? helpers.slugify(d.parent.data[0]) : ''}  depth-${data.schema.levels[d.depth - 1].name}`
                            : `depth-poDescription ${helpers.slugify(d.data.catchmentName)} ${helpers.slugify(d.data.subCatchmentName)} ${helpers.slugify(d.data.poScale)}  ${helpers.slugify(d.data.poGroup)}  ${helpers.slugify(d.data.poTheme)} ` 
                    return `node  ${classList}`
                })
                .attr("transform", (d, i) => {
                    const dy = d.y + (d.depth === 0 ? 0 : data.schema.levels[d.depth - 1].dx)
                    return `translate(${dy}, ${d.x})`
                })
                .on('click', function(event, node) {
                    event.stopPropagation()

                    if(this.classList.contains('depth-poDescription')){
                        d3.select('.modal-container').classed('open', true)
                        highlightAncestorNodes(node)
                        highlightAncestorLinks(node)
                        updateLeafModal(node.data)
                    } else {
                        const depthClass = this.classList[3].slice(this.classList[3].indexOf('-') + 1)
                        d3.selectAll('.group-label').classed('selected', false)
                        d3.select(`.${depthClass}-label`).classed('selected', true)
                        highlightLineageNodes(node)
                        highlightLineageLinks(node)
                    }
                })

        node.append("circle")
            .attr('class', d => {
                return 'node-circle'
            })
            .attr("r", d => d.children ? 0 : 10);

        // Add labels
        node.append("text")
            .attr('class',`label`) 
            .attr("x", d => d.children ? 0 : 20)
            .attr("dy", 0)
            .text((d, i) =>  labels[i])
                .call( helpers.wrapTreeLabels, 1.1 )


    // INTERACTIVITY
        function highlightAncestorNodes(node){
            const data = node.data,
                ancestors = node.ancestors(),
                nodeIDs = ancestors.map( d => `#${d.id}`)
            d3.selectAll('.node').style('opacity', 0)
            d3.selectAll(nodeIDs.toString()).style('opacity', null)
        };

        function highlightDescendantNodes(node){
            const data = node.data,
                descendants = node.descendants(),
                nodeIDs = descendants.map( d => `#${d.id}`)
            d3.selectAll('.node').style('opacity', 0)
            d3.selectAll(nodeIDs.toString()).style('opacity', null)
        };

        function highlightLineageNodes(node){
            const data = node.data,
                ancestors = node.ancestors(),
                descendants = node.descendants(),
                nodeIDs = descendants.map( d => `#${d.id}`).concat(ancestors.map( d => `#${d.id}`))

            d3.selectAll('.node').style('opacity', 0)
            d3.selectAll(nodeIDs.toString()).style('opacity', null)
        };

        function highlightAncestorLinks(node){
            const data = node.data,
                ancestors = node.ancestors(),
                parentNode = ancestors[ancestors.length - 1],
                linkIDs = []
            
            for( let i = 0; i < (ancestors.length - 1); i++ ){
                linkIDs.push(`#link-${ancestors[i+1].id}_${ancestors[i].id}`)
            }
            d3.selectAll('.link').style('opacity', 0)
            d3.selectAll(linkIDs.toString()).style('opacity', null)

        };

        function highlightDescendantLinks(node){
            const data = node.data,
                descendants = node.descendants(),
                parentNode = descendants[descendants.length - 1],
                links = []          
            for (const descNode of descendants){
                for (const link of descNode.links()){
                    links.push(link)
                }
            }
            const linkIDs = links.map(d => `#link-${d.source.id}_${d.target.id}`)
            d3.selectAll('.link').style('opacity', 0)
            d3.selectAll(linkIDs.toString()).style('opacity', null)
        };

        function highlightLineageLinks(node){
            const data = node.data,
                ancestors = node.ancestors(),
                descendants = node.descendants(),
                parentNode = descendants[descendants.length - 1],
                ancestorLinkIDs = [],
                descendantLinks = []
            
            for( let i = 0; i < (ancestors.length - 1); i++ ){
                ancestorLinkIDs.push(`#link-${ancestors[i+1].id}_${ancestors[i].id}`)
            }

            for (const descNode of descendants){
                for (const link of descNode.links()){
                    descendantLinks.push(link)
                }
            }
            const descendantLinkIDs = descendantLinks.map(d => `#link-${d.source.id}_${d.target.id}`)
       
            d3.selectAll('.link').style('opacity', 0)
            d3.selectAll(ancestorLinkIDs.concat(descendantLinkIDs).toString()).style('opacity', null)
        };

        function resetNodeLinks(){
            d3.selectAll('.node, .link').style('opacity', null)
            d3.selectAll('.group-label').classed('selected', false)
        };

        function updateLeafModal(nodeData){
            // Update the modal
            d3.select('#po-modal-summary').html(`ID: ${nodeData.poID}`)
            d3.select('#po-modal-location')
                .html(nodeData.poLocationName)
            d3.select('#po-modal-sub-catchment  .modal-content')
                .html(nodeData.subCatchmentName)
            d3.select('#po-modal-catchment  .modal-content')
                .html(nodeData.catchmentName)
            d3.select('#po-modal-description .modal-content')
                .html(nodeData.poDescription)
            d3.select('#po-modal-group .modal-content')
                .html(nodeData.poGroup)
            d3.select('#po-modal-theme .modal-content')
                .html(nodeData.poTheme)
            d3.select('#po-modal-accountability .modal-content')
                .html(nodeData.mwAccountability)
            d3.select('#po-modal-investment .modal-content')
                .html(nodeData.poInvestment)
        };

        d3.select('.modal-close').on('click', () => {
            d3.select('.modal-container').classed('open', false) 
        })

    // 5. Setup Zoom and pan behaviour
        // a. Add methods for controlling zoom and pan
        function handleZoom(e){
            d3.select('g.zoom-area')
                .attr('transform', e.transform);
        } // end handleZoom();

        function resetZoom(){
            svg.transition().duration(2000)
                .call(
                    scene.methods.zoom.transform, 
                    d3.zoomIdentity,
                    d3.zoomTransform(svg.node()).invert([settings.dims.width / 2, settings.dims.height / 2])
                )           
        }; // end resetZoom()'

        
        // b. Add zoom and pan handlers to SVG
        const zoom = d3.zoom()
            .scaleExtent([1, 3])
            .translateExtent([
                [-settings.dims.width * 0.0, -settings.dims.height * 0.0], 
                [settings.dims.width * 1.0, settings.dims.height * 1.0]
            ])
            .on('zoom', handleZoom);

        // svg.call(zoom) 


    };



//  HELPER METHODS
const helpers= {
    slugify: function (str) {
        str = str.replace(/^\s+|\s+$/g, '').toLowerCase(); // trim           
        const from = "àáäâèéëêìíïîòóöôùúüûñç·/_,:;",      // remove accents, swap ñ for n, etc
            to   = "aaaaeeeeiiiioooouuuunc------"
        for (var i=0, l=from.length ; i<l ; i++) {
            str = str.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i));
        }
        str = str.replace(/[^a-z0-9 -]/g, '') // remove invalid chars
            .replace(/\s+/g, '-') // collapse whitespace and replace by -
            .replace(/-+/g, '-'); // collapse dashes
        return str;
    }, 
    wrapTreeLabels: function(selection, lineHeight = 0.85, centerVertical = true) {
        selection.each(function() {
            let text = d3.select(this),
                textData = text.node().__data__,
                width = textData.depth === 0 ? null : data.schema.levels[textData.depth - 1].wrapLength,
                words = text.text().split(/\s+/).reverse(),
                word,
                line = [],
                lineNumber = 0,
                y = text.attr("y"),
                x = text.attr("x"),
                fontSize = parseFloat(text.style("font-size")),
                dy = parseFloat(text.attr("dy")),
                tspan = text.text(null).append("tspan").attr("x", x).attr("y", y).attr("dy", dy + "em");

            width = width ? width : settings.dims.width
            while (word = words.pop()) {
                line.push(word);
                tspan.text(line.join(" "));

                if (tspan.node().getComputedTextLength() > width) {
                    line.pop();
                    tspan.text(line.join(" "));
                    line = [word];
                    lineNumber++                    
                    tspan = text.append("tspan")
                        .attr("x", x)
                        .attr("y",  y)
                        .attr("dy", (lineNumber > 1 ? 1 : lineNumber) * lineHeight + dy + "em")
                        .text(word);

                }                    
            }            
            if(centerVertical){
                text.style("transform",  "translateY(-"+(fontSize * (lineNumber) * 0.5)+"px)")
            }
            
        })
    }
}