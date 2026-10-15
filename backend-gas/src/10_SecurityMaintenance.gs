/** Dapat dipasang sebagai time-driven trigger; bukan endpoint HTTP. */
function cleanupSecurityState() {
  return SsoDatabase.configured_().atomic_(function(tx){
    var now=Date.now(), results={};
    // Nonce selalu ditahan 300 detik, melebihi 2 x skew maksimum (120 dtk) + margin.
    results.ReplayNonces=tx.pruneExpired_('ReplayNonces',new Date(now).toISOString(),500);
    // Retensi forensik pendek, tidak menghapus AuthenticationLogs/AuditLogs/OperationJournal.
    results.AuthenticationChallenges=tx.pruneExpired_('AuthenticationChallenges',new Date(now-86400000).toISOString(),500);
    results.AdminSessions=tx.pruneExpired_('AdminSessions',new Date(now-7*86400000).toISOString(),500);
    results.PasswordResetTokens=tx.pruneExpired_('PasswordResetTokens',new Date(now-7*86400000).toISOString(),500);
    results.AuthenticationRateLimits=tx.pruneRateLimits_(500);
    return results;
  });
}
