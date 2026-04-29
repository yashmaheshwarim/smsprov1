      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard title="Messages Sent" value={stats.sent} icon={Send} />
        <StatCard title="Delivered" value={stats.delivered} icon={CheckCircle} changeType="positive" />
        <StatCard title="Failed" value={stats.failed} icon={XCircle} changeType="negative" />
        <StatCard
          title="In Queue"
          value={queueStats.pending}
          icon={Clock}
          changeType={queueStats.pending > 0 ? "warning" : "neutral"}
        />
        <StatCard
          title="Zavu Status"
          value={zavuConnected ? "Connected" : "Not Connected"}
          icon={Zap}
          changeType={zavuConnected ? "positive" : "neutral"}
          change={zavuConnected ? "API Active" : "Setup required"}
        />
      </div>