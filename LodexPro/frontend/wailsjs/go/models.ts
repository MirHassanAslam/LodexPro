export namespace models {
	
	export class AppConfig {
	    max_segments: number;
	    network_timeout: number;
	    max_retry: number;
	    retry_delay: number;
	    max_parallel_downloads: number;
	    speed_limit_kbps: number;
	    default_download_folder: string;
	    file_conflict_mode: string;
	    temp_dir: string;
	    category_folders: Record<string, string>;
	    start_download_automatically: boolean;
	    show_completion_dialog: boolean;
	    monitor_clipboard: boolean;
	    run_on_logon: boolean;
	    keep_pc_awake: boolean;
	    blocked_hosts: string[];
	    run_command_after_completion: boolean;
	    after_completion_command: string;
	    scan_with_antivirus: boolean;
	    antivirus_executable: string;
	    antivirus_args: string;
	    proxy_mode: string;
	    proxy_host: string;
	    proxy_port: number;
	    proxy_user: string;
	    proxy_pass: string;
	
	    static createFrom(source: any = {}) {
	        return new AppConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.max_segments = source["max_segments"];
	        this.network_timeout = source["network_timeout"];
	        this.max_retry = source["max_retry"];
	        this.retry_delay = source["retry_delay"];
	        this.max_parallel_downloads = source["max_parallel_downloads"];
	        this.speed_limit_kbps = source["speed_limit_kbps"];
	        this.default_download_folder = source["default_download_folder"];
	        this.file_conflict_mode = source["file_conflict_mode"];
	        this.temp_dir = source["temp_dir"];
	        this.category_folders = source["category_folders"];
	        this.start_download_automatically = source["start_download_automatically"];
	        this.show_completion_dialog = source["show_completion_dialog"];
	        this.monitor_clipboard = source["monitor_clipboard"];
	        this.run_on_logon = source["run_on_logon"];
	        this.keep_pc_awake = source["keep_pc_awake"];
	        this.blocked_hosts = source["blocked_hosts"];
	        this.run_command_after_completion = source["run_command_after_completion"];
	        this.after_completion_command = source["after_completion_command"];
	        this.scan_with_antivirus = source["scan_with_antivirus"];
	        this.antivirus_executable = source["antivirus_executable"];
	        this.antivirus_args = source["antivirus_args"];
	        this.proxy_mode = source["proxy_mode"];
	        this.proxy_host = source["proxy_host"];
	        this.proxy_port = source["proxy_port"];
	        this.proxy_user = source["proxy_user"];
	        this.proxy_pass = source["proxy_pass"];
	    }
	}
	export class DownloadQueue {
	    id: string;
	    name: string;
	    is_default: boolean;
	    max_concurrent: number;
	    start_time: string;
	    stop_time: string;
	    is_scheduled: boolean;
	    days_of_week: number[];
	    task_ids: string[];
	    post_action: string;
	
	    static createFrom(source: any = {}) {
	        return new DownloadQueue(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.is_default = source["is_default"];
	        this.max_concurrent = source["max_concurrent"];
	        this.start_time = source["start_time"];
	        this.stop_time = source["stop_time"];
	        this.is_scheduled = source["is_scheduled"];
	        this.days_of_week = source["days_of_week"];
	        this.task_ids = source["task_ids"];
	        this.post_action = source["post_action"];
	    }
	}
	export class Segment {
	    id: number;
	    start_byte: number;
	    end_byte: number;
	    downloaded_size: number;
	    completed: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Segment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.start_byte = source["start_byte"];
	        this.end_byte = source["end_byte"];
	        this.downloaded_size = source["downloaded_size"];
	        this.completed = source["completed"];
	    }
	}
	export class DownloadTask {
	    id: string;
	    url: string;
	    filename: string;
	    save_path: string;
	    total_size: number;
	    downloaded_size: number;
	    status: string;
	    category: string;
	    format: string;
	    queue_id: string;
	    segments: Segment[];
	    date_created: string;
	    speed: number;
	    eta: number;
	
	    static createFrom(source: any = {}) {
	        return new DownloadTask(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.url = source["url"];
	        this.filename = source["filename"];
	        this.save_path = source["save_path"];
	        this.total_size = source["total_size"];
	        this.downloaded_size = source["downloaded_size"];
	        this.status = source["status"];
	        this.category = source["category"];
	        this.format = source["format"];
	        this.queue_id = source["queue_id"];
	        this.segments = this.convertValues(source["segments"], Segment);
	        this.date_created = source["date_created"];
	        this.speed = source["speed"];
	        this.eta = source["eta"];
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
	export class MediaItem {
	    id: string;
	    url: string;
	    filename: string;
	    description: string;
	    size: number;
	    date_added: string;
	
	    static createFrom(source: any = {}) {
	        return new MediaItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.url = source["url"];
	        this.filename = source["filename"];
	        this.description = source["description"];
	        this.size = source["size"];
	        this.date_added = source["date_added"];
	    }
	}
	
	export class UpdateInfo {
	    available: boolean;
	    current: string;
	    latest: string;
	    url: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.available = source["available"];
	        this.current = source["current"];
	        this.latest = source["latest"];
	        this.url = source["url"];
	    }
	}

}

export namespace services {
	
	export class VideoFormat {
	    format_id: string;
	    ext: string;
	    resolution: string;
	    filesize: number;
	    vcodec: string;
	    acodec: string;
	
	    static createFrom(source: any = {}) {
	        return new VideoFormat(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.format_id = source["format_id"];
	        this.ext = source["ext"];
	        this.resolution = source["resolution"];
	        this.filesize = source["filesize"];
	        this.vcodec = source["vcodec"];
	        this.acodec = source["acodec"];
	    }
	}
	export class VideoMetadata {
	    id: string;
	    title: string;
	    description: string;
	    duration: number;
	    formats: VideoFormat[];
	
	    static createFrom(source: any = {}) {
	        return new VideoMetadata(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.duration = source["duration"];
	        this.formats = this.convertValues(source["formats"], VideoFormat);
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

