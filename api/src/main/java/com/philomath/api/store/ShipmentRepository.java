package com.philomath.api.store;

import com.philomath.api.dto.ShipmentStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ShipmentRepository extends JpaRepository<ShipmentEntity, Long> {

    @Query("""
            select s from ShipmentEntity s
            where s.id >= :startId
              and (:reference = '' or lower(s.reference) like lower(concat('%', :reference, '%')))
              and (:status is null or s.status = :status)
            order by s.id asc
            """)
    List<ShipmentEntity> search(
            @Param("startId") Long startId,
            @Param("reference") String reference,
            @Param("status") ShipmentStatus status,
            Pageable pageable
    );
}
