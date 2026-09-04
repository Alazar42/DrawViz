export namespace models {
	
	export class LineStyle {
	    stroke?: string;
	    strokeWidth?: number;
	    lineType?: string;
	
	    static createFrom(source: any = {}) {
	        return new LineStyle(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.stroke = source["stroke"];
	        this.strokeWidth = source["strokeWidth"];
	        this.lineType = source["lineType"];
	    }
	}
	export class Point3D {
	    x: number;
	    y: number;
	    z: number;
	
	    static createFrom(source: any = {}) {
	        return new Point3D(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.x = source["x"];
	        this.y = source["y"];
	        this.z = source["z"];
	    }
	}
	export class DrawingLine {
	    id: string;
	    start: Point3D;
	    end: Point3D;
	    layerId: string;
	    style: LineStyle;
	
	    static createFrom(source: any = {}) {
	        return new DrawingLine(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.start = this.convertValues(source["start"], Point3D);
	        this.end = this.convertValues(source["end"], Point3D);
	        this.layerId = source["layerId"];
	        this.style = this.convertValues(source["style"], LineStyle);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Layer {
	    id: string;
	    name: string;
	    visible: boolean;
	    locked: boolean;
	    color: string;
	
	    static createFrom(source: any = {}) {
	        return new Layer(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.visible = source["visible"];
	        this.locked = source["locked"];
	        this.color = source["color"];
	    }
	}
	export class GridSettings {
	    unitSize: number;
	    snapToGrid: boolean;
	    snapToIsometric: boolean;
	    snapToEndpoints: boolean;
	    showGrid: boolean;
	    gridType: string;
	
	    static createFrom(source: any = {}) {
	        return new GridSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.unitSize = source["unitSize"];
	        this.snapToGrid = source["snapToGrid"];
	        this.snapToIsometric = source["snapToIsometric"];
	        this.snapToEndpoints = source["snapToEndpoints"];
	        this.showGrid = source["showGrid"];
	        this.gridType = source["gridType"];
	    }
	}
	export class ProjectMetadata {
	    name: string;
	    author: string;
	    created: string;
	    modified: string;
	    mode: string;
	
	    static createFrom(source: any = {}) {
	        return new ProjectMetadata(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.author = source["author"];
	        this.created = source["created"];
	        this.modified = source["modified"];
	        this.mode = source["mode"];
	    }
	}
	export class DrawVizProject {
	    version: string;
	    metadata: ProjectMetadata;
	    gridSettings: GridSettings;
	    layers: Layer[];
	    lines: DrawingLine[];
	    activeLessonId?: string;
	
	    static createFrom(source: any = {}) {
	        return new DrawVizProject(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.metadata = this.convertValues(source["metadata"], ProjectMetadata);
	        this.gridSettings = this.convertValues(source["gridSettings"], GridSettings);
	        this.layers = this.convertValues(source["layers"], Layer);
	        this.lines = this.convertValues(source["lines"], DrawingLine);
	        this.activeLessonId = source["activeLessonId"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	

}

