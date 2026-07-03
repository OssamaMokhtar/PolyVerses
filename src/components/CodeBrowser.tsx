import { useState } from 'react';
import { AthenaCodeStore } from '../AthenaCodeStore';
import { CodeFile } from '../types';
import { FolderCode, File, Copy, Check, ChevronDown, ChevronRight, Terminal, Info } from 'lucide-react';

export function CodeBrowser() {
  const [selectedFile, setSelectedFile] = useState<CodeFile>(AthenaCodeStore[0]);
  const [copied, setCopied] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    'orchestrator': true,
    'agents-high': true,
    'agents-medium': true,
    'gates': true,
    'context': true,
    'rbac': true,
    'observability': true,
    'terraform': true,
    'k8s': true,
    'github-workflows': true,
    'api-docs': true,
  });

  const categories = [
    { id: 'orchestrator', label: 'Orchestration Engine (Python)' },
    { id: 'agents-high', label: 'Priority High Agents' },
    { id: 'agents-medium', label: 'Priority Medium Agents' },
    { id: 'gates', label: 'Authorized Gating System' },
    { id: 'context', label: 'Context & MoE Graph Controllers' },
    { id: 'rbac', label: 'RBAC Matrices' },
    { id: 'observability', label: 'Telemetry Exports' },
    { id: 'terraform', label: 'Terraform IaC' },
    { id: 'k8s', label: 'Kubernetes Descriptors' },
    { id: 'github-workflows', label: 'GitHub CI/CD Streamlines' },
    { id: 'api-docs', label: 'API OpenAPI specs' },
  ];

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentCategoryLabel = categories.find(c => c.id === selectedFile.category)?.label || 'Codebase';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[calc(100vh-140px)]">
      
      {/* Sidebar Navigation */}
      <div className="lg:col-span-4 bg-[#121215]/85 border border-[#27272A] rounded-xl p-4 flex flex-col h-[650px] overflow-hidden shadow-lg">
        <div className="flex items-center space-x-2 pb-3 mb-3 border-b border-[#27272A]">
          <FolderCode className="w-5 h-5 text-[#00A3FF]" />
          <span className="font-sans font-bold text-xs uppercase tracking-wider text-[#F4F4F5]">PolyVerses Source Manifest</span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          {categories.map((cat) => {
            const files = AthenaCodeStore.filter((f) => f.category === cat.id);
            if (files.length === 0) return null;

            const isExpanded = expandedCategories[cat.id];

            return (
              <div key={cat.id} className="space-y-1">
                {/* Folder Header */}
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="w-full flex items-center justify-between py-1.5 px-2 hover:bg-[#16161A] rounded text-left transition text-xs font-semibold text-[#A1A1AA] cursor-pointer group"
                >
                  <div className="flex items-center space-x-1.5 overflow-hidden">
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-[#71717A]" /> : <ChevronRight className="w-3.5 h-3.5 text-[#71717A]" />}
                    <span className="truncate group-hover:text-[#E4E4E7] transition text-[11px] uppercase tracking-wider">{cat.label}</span>
                  </div>
                  <span className="font-mono text-[9px] px-1.5 py-0.2 bg-[#0C0C0E] border border-[#27272A] rounded text-[#71717A] shrink-0 font-bold">
                    {files.length}
                  </span>
                </button>

                {/* Sub-files */}
                {isExpanded && (
                  <div className="pl-4 space-y-1 border-l border-[#27272A] ml-3.5 py-1">
                    {files.map((file) => (
                      <button
                        key={file.path}
                        onClick={() => setSelectedFile(file)}
                        className={`w-full flex items-center space-x-2 py-1.5 px-2.5 rounded text-left transition font-mono text-[11px] cursor-pointer ${
                          selectedFile.path === file.path
                            ? 'bg-[#00A3FF]/10 text-[#00A3FF] border-l-2 border-[#00A3FF] pl-2'
                            : 'text-[#71717A] hover:text-[#E4E4E7] hover:bg-[#16161A]/50'
                        }`}
                      >
                        <File className="w-3.5 h-3.5 shrink-0 text-[#71717A]" />
                        <span className="truncate">{file.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Code Editor Preview */}
      <div className="lg:col-span-8 flex flex-col h-[650px] bg-[#121215]/40 border border-[#27272A] rounded-xl overflow-hidden relative">
        
        {/* Editor Titlebar */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#0C0C0E] border-b border-[#27272A]">
          <div className="flex items-center space-x-2 overflow-hidden">
            <Terminal className="w-4 h-4 text-[#00A3FF]" />
            <span className="font-mono text-xs text-[#E4E4E7] truncate">{selectedFile.path}</span>
            <span className="text-[9px] font-mono px-2 py-0.5 bg-[#121215] border border-[#27272A] rounded text-[#71717A] uppercase tracking-wider shrink-0 font-bold">
              {selectedFile.language}
            </span>
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#121215] hover:bg-[#1A1A1F] border border-[#27272A] rounded transition text-xs font-mono text-[#E4E4E7] cursor-pointer uppercase tracking-wider"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5 text-[#00A3FF]" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        {/* File dynamic explanations */}
        <div className="p-3 px-4 bg-[#00A3FF]/5 border-b border-[#27272A] text-xs text-[#E4E4E7] flex items-start space-x-2.5">
          <Info className="w-4 h-4 text-[#00A3FF] shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold text-[#E4E4E7] font-mono uppercase tracking-wider text-[11px]">{currentCategoryLabel} Component:</span>{' '}
            <span className="text-[#A1A1AA]">{selectedFile.description}</span>
          </div>
        </div>

        {/* Editor Code Body */}
        <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed bg-[#0C0C0E]/40 text-[#A1A1AA] select-text">
          <pre className="whitespace-pre">{selectedFile.code}</pre>
        </div>
      </div>

    </div>
  );
}
